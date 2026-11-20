// The shift DAG for both crews: Rosa resolves → Vic, June, Otto in parallel → Fern → Rosa texts.
// Grok Bots only ever do one job when their webhook fires; this file decides who goes next.
import type { AgentId, Run, Source } from '../types';
import { config } from '../config';
import { ApiErr } from '../http';
import { nowIso } from '../ids';
import { getRecord, mutate, type Emit, type ShiftState } from '../store';
import { kv } from '../store/kv';
import { AGENT_INFO, agentOf, candidateOf } from '../runs';
import { currentJob, jobKey, type Phase } from './jobs';

export interface Job {
  runId: string;
  agent: AgentId;
  phase: Phase;
  via: 'api' | 'grokbot';
}

const SCAN_AGENTS: AgentId[] = ['vic', 'june', 'otto'];
/** Lou joins the scan when the owner sent expenses or a catalog (Dot sorted them before the shift). */
const hasBooks = (run: Run) => !!run.books?.some((f) => f.kind === 'expenses' || f.kind === 'catalog' || f.kind === 'sales');
const scanAgents = (run: Run): AgentId[] => (hasBooks(run) ? [...SCAN_AGENTS, 'lou'] : SCAN_AGENTS);
export const GROKBOT_CLOCKIN_MS = 90_000;
export const GROKBOT_DONE_MS = 6 * 60_000;

function plan(run: Run, shift: ShiftState, emit: Emit, keys: string[]): Job[] {
  const jobs: Job[] = [];
  const hooks = config().webhooks;
  for (const key of keys) {
    if (shift.started.includes(key)) continue;
    const [agent, phase] = key.split(':') as [AgentId, Phase];
    let via: Job['via'] = 'api';
    if (run.crew === 'grokbot') {
      if (hooks[agent]) via = 'grokbot';
      else emit('agent.status', { message: `${AGENT_INFO[agent].name} has no Grok Bot set up yet. The API crew is doing this job.`, progress: 0 }, { agent });
    }
    shift.started.push(key);
    shift.jobs[key] = { at: nowIso(), via };
    const a = agentOf(run, agent);
    a.via = via;
    a.status = 'waiting';
    jobs.push({ runId: run.id, agent, phase, via });
  }
  return jobs;
}

/** Moves the shift forward as far as it can. Returns jobs to launch (outside the lock). */
function advance(run: Run, shift: ShiftState, emit: Emit): Job[] {
  if (shift.ping) return [];
  for (let guard = 0; guard < 6; guard++) {
    const fin = (k: string) => shift.finished.includes(k);
    if (shift.phase === 'resolve' && fin('rosa:resolve')) {
      const cand = run.business ? undefined : candidateOf(shift);
      if (!run.business && cand) {
        // Rosa ran out of time: carry on from what the owner picked in lookup (real, with a source link).
        const source: Source = { id: `src_${run.sources.length + 1}`, url: cand.sourceUrl, title: `${cand.name} (picked in lookup)`, kind: cand.website === cand.sourceUrl ? 'website' : 'maps', fetchedAt: nowIso(), foundBy: 'rosa' };
        run.sources.push(source);
        emit('source.found', { source }, { agent: 'rosa', room: 'front_desk' });
        run.business = {
          id: `biz_${run.id.slice(4)}`,
          name: cand.name,
          ...(cand.category ? { category: cand.category } : {}),
          ...(cand.address ? { address: cand.address } : {}),
          ...(cand.city ? { city: cand.city } : {}),
          ...(cand.website ? { website: cand.website } : {}),
          items: [],
          sourceIds: [source.id],
        };
        emit('business.resolved', { business: run.business }, { agent: 'rosa', room: 'front_desk' });
        emit('agent.status', { message: "Couldn't read a price list in time; the crew works from the listing you picked.", progress: 100 }, { agent: 'rosa', room: 'front_desk' });
      }
      if (!run.business) {
        if (!hasBooks(run)) {
          close(run, shift, emit, 'failed', "Rosa couldn't pin down the business, so the crew stood down.");
          return [];
        }
        // Not findable online, but the owner sent their books: tonight's shift is the books.
        run.business = { id: run.id, name: run.query || 'Your business', items: [], sourceIds: [] };
        emit('business.resolved', { business: run.business }, { agent: 'rosa' });
        emit('agent.status', { message: "Couldn't find this shop online, so tonight the crew works from your books.", progress: 100 }, { agent: 'rosa' });
        shift.phase = 'scan';
        const books = plan(run, shift, emit, [jobKey('lou', 'main')]);
        if (books.length) return books;
        continue; // Lou may already be done: fall through to the scan check so Fern starts
      }
      shift.phase = 'scan';
      const scan = plan(run, shift, emit, scanAgents(run).map((a) => jobKey(a, 'main')));
      if (scan.length) return scan;
      continue;
    }
    if (shift.phase === 'scan' && scanAgents(run).filter((a) => shift.started.includes(jobKey(a, 'main'))).every((a) => fin(jobKey(a, 'main')))) {
      shift.phase = 'fix';
      if (run.findings.length) return plan(run, shift, emit, ['fern:main']);
      shift.finished.push('fern:main');
      continue;
    }
    if (shift.phase === 'fix' && fin('fern:main')) {
      shift.phase = 'report';
      return plan(run, shift, emit, ['rosa:report']);
    }
    if (shift.phase === 'report' && fin('rosa:report')) {
      close(run, shift, emit, run.fixes.some((f) => f.status === 'drafted') ? 'awaiting_approval' : 'done');
      return [];
    }
    return [];
  }
  return [];
}

function close(run: Run, shift: ShiftState, emit: Emit, status: Run['status'], error?: string) {
  shift.phase = 'closed';
  run.status = status;
  run.finishedAt = nowIso();
  if (error) emit('error', { message: error });
  emit('run.finished', { totals: run.totals, status });
}

// ---------- launching ----------

type Dispatcher = (job: Job) => Promise<void>;

/** Default: one HTTP call per API-crew agent so each gets its own function invocation on Vercel. */
let apiDispatcher: Dispatcher = async (job) => {
  const c = config();
  try {
    const res = await fetch(`${c.publicUrl}/api/crew/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.agentToken}` },
      body: JSON.stringify({ runId: job.runId, agent: job.agent, phase: job.phase }),
      signal: AbortSignal.timeout(10_000),
    });
    // Only our own route answers 202 + {ok}. A protected or wrong PUBLIC_URL answers a login page (often 200).
    const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (res.status !== 202 || !j?.ok) throw new Error(`crew/run at ${c.publicUrl} answered ${res.status}; is PUBLIC_URL the public production URL?`);
  } catch (e) {
    console.warn('[shift] self-dispatch failed, running in-process', e);
    const { runAgent } = await import('./api');
    // keep the function alive until the agent finishes (a bare promise is cut off when the response ends)
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(runAgent(job.runId, job.agent, job.phase).catch((err) => console.error('[shift] in-process agent failed', err)));
  }
};

export function setApiDispatcher(d: Dispatcher) {
  apiDispatcher = d;
}

export async function launch(jobs: Job[]) {
  await Promise.all(
    jobs.map(async (job) => {
      if (job.via === 'grokbot') {
        const { triggerBot } = await import('./grokbot');
        const run = (await getRecord(job.runId))!.run;
        const r = await triggerBot(job, run);
        if (r.ok) return;
        await takeOver(job.runId, job.agent, `${AGENT_INFO[job.agent].name}'s Grok Bot didn't answer (${r.error}). The API crew took over.`);
        return;
      }
      await apiDispatcher(job);
    }),
  );
}

async function takeOver(runId: string, agent: AgentId, message: string) {
  const { result } = await mutate(runId, ({ run, shift, emit }) => {
    const key = currentJob(agent, shift);
    const j = shift.jobs[key];
    if (!j || shift.finished.includes(key) || j.via === 'api') return null;
    j.via = 'api';
    j.tookOver = true;
    j.at = nowIso();
    const a = agentOf(run, agent);
    a.via = 'api';
    emit('agent.status', { message, progress: a.progress }, { agent, room: a.room });
    return { runId, agent, phase: key.split(':')[1] as Phase, via: 'api' as const };
  });
  if (result) await apiDispatcher(result);
}

// ---------- public API ----------

export async function startRun(runId: string) {
  const { result, run } = await mutate(runId, ({ run, shift, emit }) => {
    if (shift.phase !== 'created') throw new ApiErr('conflict', 'This run already started');
    run.status = 'running';
    shift.phase = 'resolve';
    emit('run.started', { crew: run.crew });
    // Books don't need the business resolved: Lou starts with Rosa, so the crew is busy right away.
    return plan(run, shift, emit, hasBooks(run) ? ['rosa:resolve', jobKey('lou', 'main')] : ['rosa:resolve']);
  });
  await launch(result);
  return { crew: run.crew, triggered: result[0]?.via ?? 'api' };
}

/** Called by the `done` tool, by the API crew when a loop ends, and by watchdogs. Idempotent. */
export async function finishJob(runId: string, agent: AgentId, r: { summary: string; ok: boolean }) {
  const { result } = await mutate(runId, ({ run, shift, emit }) => {
    const key = currentJob(agent, shift);
    const a = agentOf(run, agent);
    if (shift.ping) {
      a.status = 'done';
      emit('agent.clocked_out', { summary: r.summary }, { agent, room: a.room });
      return [];
    }
    if (shift.finished.includes(key)) return [];
    if (!shift.started.includes(key)) throw new ApiErr('conflict', `${agent} isn't on a job right now (shift phase: ${shift.phase})`);
    shift.finished.push(key);
    a.status = r.ok ? 'done' : 'failed';
    if (r.ok) a.progress = 100;
    a.message = r.summary.slice(0, 200);
    a.thinking = undefined;
    if (!r.ok) emit('agent.status', { message: r.summary, progress: a.progress }, { agent, room: a.room });
    emit('agent.clocked_out', { summary: r.summary }, { agent, room: a.room });
    return advance(run, shift, emit);
  });
  // Safety net: after Rosa's report, make sure the owner got the numbered list.
  if (agent === 'rosa') {
    const { ensureApprovalText } = await import('../text/send');
    await ensureApprovalText(runId).catch((e) => console.warn('[shift] approval text', e));
  }
  await launch(result);
}

/** Watchdog. Cheap; called from event polling and agent runs. */
export async function tick(runId: string) {
  if (!(await kv().set(`tick:${runId}`, '1', { px: 3000, nx: true }))) return;
  const rec = await getRecord(runId);
  if (!rec || rec.shift.phase === 'created' || rec.shift.phase === 'closed' || rec.shift.ping) return;
  const now = Date.now();
  const budget = config().apiBudgetMs + 60_000;
  for (const key of rec.shift.started) {
    if (rec.shift.finished.includes(key)) continue;
    const j = rec.shift.jobs[key];
    const agent = key.split(':')[0] as AgentId;
    const age = now - Date.parse(j.at);
    if (j.via === 'grokbot' && ((!j.clockedInAt && age > GROKBOT_CLOCKIN_MS) || age > GROKBOT_DONE_MS)) {
      await takeOver(runId, agent, `${AGENT_INFO[agent].name}'s Grok Bot ${j.clockedInAt ? "didn't finish in 6 minutes" : "didn't clock in"}. The API crew took over.`);
    } else if (j.via === 'api' && age > budget) {
      await finishJob(runId, agent, { summary: 'Ran out of time; handing in what I found', ok: false });
    }
  }
  const { maybeEarlyAlert } = await import('../text/send');
  await maybeEarlyAlert(runId).catch(() => {});
}
