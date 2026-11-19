// Runs, the append-only event log, owners and texts. Every run change goes through mutate().
import type { AfterhoursEvent, AgentId, EventType, Owner, Room, Run, TextMessage } from '../types';
import { ApiErr } from '../http';
import { nowIso } from '../ids';
import { computeTotals } from '../engine/totals';
import { kv } from './kv';

/** Backend-only bookkeeping for the shift DAG. Not part of the contract, never sent to the UI. */
export interface ShiftState {
  phase: 'created' | 'resolve' | 'scan' | 'fix' | 'report' | 'closed';
  /** job keys like "rosa:resolve", "vic:main" */
  started: string[];
  finished: string[];
  /** per job: when it was triggered, when the agent clocked in, which crew it runs on */
  jobs: Record<string, { at: string; clockedInAt?: string; via: 'api' | 'grokbot'; tookOver?: boolean }>;
  earlyAlertSent: boolean;
  approvalSent: boolean;
  textsSent: number;
  ping?: boolean;
}

interface RunRecord {
  run: Run;
  shift: ShiftState;
}

export const newShift = (): ShiftState => ({
  phase: 'created',
  started: [],
  finished: [],
  jobs: {},
  earlyAlertSent: false,
  approvalSent: false,
  textsSent: 0,
});

const runKey = (id: string) => `run:${id}`;
const eventsKey = (id: string) => `run:${id}:events`;
const lockKey = (id: string) => `lock:run:${id}`;

export async function getRecord(runId: string): Promise<RunRecord | null> {
  const raw = await kv().get(runKey(runId));
  return raw ? (JSON.parse(raw) as RunRecord) : null;
}

export async function getRun(runId: string): Promise<Run | null> {
  return (await getRecord(runId))?.run ?? null;
}

export async function mustGetRun(runId: string): Promise<Run> {
  const run = await getRun(runId);
  if (!run) throw new ApiErr('not_found', `No run ${runId}`);
  return run;
}

export async function insertRun(run: Run, shift: ShiftState, opts: { index?: boolean } = {}) {
  await kv().set(runKey(run.id), JSON.stringify({ run, shift }));
  if (opts.index !== false) await kv().lpush('runs:index', run.id);
}

export async function listRunIds(limit = 20): Promise<string[]> {
  return kv().lrange('runs:index', 0, limit - 1);
}

// ---------- the per-run lock ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const localChains = new Map<string, Promise<unknown>>();

async function withLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  // In-process chain first (cheap, and makes the memory store safe), then a Redis lock across instances.
  const prev = localChains.get(runId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chain = prev.then(() => mine);
  localChains.set(runId, chain);
  await prev;
  const token = Math.random().toString(36).slice(2);
  try {
    const deadline = Date.now() + 15_000;
    while (!(await kv().set(lockKey(runId), token, { px: 10_000, nx: true }))) {
      if (Date.now() > deadline) throw new ApiErr('conflict', 'Run is busy, try again');
      await sleep(40 + Math.random() * 60);
    }
    try {
      return await fn();
    } finally {
      if ((await kv().get(lockKey(runId))) === token) await kv().del(lockKey(runId));
    }
  } finally {
    release();
    if (localChains.get(runId) === chain) localChains.delete(runId);
  }
}

// ---------- mutate: load, change, append events, save ----------

export type Emit = (type: EventType, data?: Record<string, unknown>, meta?: { agent?: AgentId; room?: Room }) => void;

export interface MutateCtx {
  run: Run;
  shift: ShiftState;
  emit: Emit;
}

export async function mutate<R>(runId: string, fn: (ctx: MutateCtx) => R | Promise<R>): Promise<{ run: Run; shift: ShiftState; result: R; events: AfterhoursEvent[] }> {
  return withLock(runId, async () => {
    const rec = await getRecord(runId);
    if (!rec) throw new ApiErr('not_found', `No run ${runId}`);
    const pending: Omit<AfterhoursEvent, 'seq'>[] = [];
    const emit: Emit = (type, data = {}, meta = {}) =>
      pending.push({ at: nowIso(), runId, type, data, ...(meta.agent ? { agent: meta.agent } : {}), ...(meta.room ? { room: meta.room } : {}) });
    const result = await fn({ run: rec.run, shift: rec.shift, emit });
    const events: AfterhoursEvent[] = pending.map((e, i) => ({ seq: rec.run.lastSeq + i + 1, ...e }));
    rec.run.lastSeq += events.length;
    rec.run.totals = computeTotals(rec.run.findings, rec.run.fixes);
    await kv().set(runKey(runId), JSON.stringify(rec));
    if (events.length) await kv().rpush(eventsKey(runId), ...events.map((e) => JSON.stringify(e)));
    return { run: rec.run, shift: rec.shift, result, events };
  });
}

/** Events with seq > after. Because seq is assigned under the lock, list index = seq - 1. */
export async function readEvents(runId: string, after = 0, limit = 200): Promise<{ events: AfterhoursEvent[]; next: number }> {
  const raw = await kv().lrange(eventsKey(runId), after, after + Math.min(limit, 200) - 1);
  const events = raw.map((r) => JSON.parse(r) as AfterhoursEvent);
  return { events, next: events.length ? events[events.length - 1].seq : after };
}

// ---------- owners and texts ----------

const ownerKey = (id: string) => `owner:${id}`;

export async function getOwner(id: string): Promise<Owner | null> {
  const raw = await kv().get(ownerKey(id));
  return raw ? (JSON.parse(raw) as Owner) : null;
}

export async function saveOwner(o: Owner) {
  await kv().set(ownerKey(o.id), JSON.stringify(o));
  if (o.phone) await kv().set(`owner:by-phone:${o.phone}`, o.id);
  if (o.telegramChatId) await kv().set(`owner:by-tg:${o.telegramChatId}`, o.id);
}

export async function findOwner(by: { phone?: string; telegramChatId?: string }): Promise<Owner | null> {
  const id = by.phone ? await kv().get(`owner:by-phone:${by.phone}`) : by.telegramChatId ? await kv().get(`owner:by-tg:${by.telegramChatId}`) : null;
  return id ? getOwner(id) : null;
}

export async function saveText(m: TextMessage) {
  await kv().rpush(`owner:${m.ownerId}:texts`, JSON.stringify(m));
}

export async function listTexts(ownerId: string, runId?: string): Promise<TextMessage[]> {
  const all = (await kv().lrange(`owner:${ownerId}:texts`, 0, -1)).map((r) => JSON.parse(r) as TextMessage);
  return runId ? all.filter((m) => !m.runId || m.runId === runId) : all;
}

/** fixId → runId, so /api/fixes/:id and "YES 2" can find the run. */
export async function indexFix(fixId: string, runId: string) {
  await kv().set(`fix:${fixId}`, runId);
}
export async function runIdForFix(fixId: string) {
  return kv().get(`fix:${fixId}`);
}
