// Creating runs and small helpers tools share.
import type { Agent, AgentId, BusinessCandidate, CrewMode, Finding, Room, Run } from './types';
import { ApiErr } from './http';
import { newId, nowIso } from './ids';
import { insertRun, mutate, newShift, type Emit } from './store';
import type { NewFinding } from './engine/prices';

export const AGENT_INFO: Record<AgentId, { name: string; role: string; job: string; home: Room }> = {
  rosa: { name: 'Rosa', role: 'Night manager', job: 'Runs the shift and texts you', home: 'front_desk' },
  vic: { name: 'Vic', role: 'Price checker', job: 'Walks the street and compares prices', home: 'street' },
  june: { name: 'June', role: 'Listener', job: 'Reads reviews and X posts', home: 'shop_floor' },
  otto: { name: 'Otto', role: 'Storefront', job: 'Checks your website and listings', home: 'server_closet' },
  lou: { name: 'Lou', role: 'Bookkeeper', job: 'Reads your books', home: 'back_office' },
  dot: { name: 'Dot', role: 'File clerk', job: 'Sorts the files you send', home: 'stockroom' },
  fern: { name: 'Fern', role: 'Fixer', job: 'Drafts the fixes', home: 'mailroom' },
};

export const ROOMS: Room[] = ['front_desk', 'street', 'shop_floor', 'stockroom', 'back_office', 'server_closet', 'mailroom', 'vault', 'loading_dock'];

function agentFor(id: AgentId, crew: CrewMode): Agent {
  const i = AGENT_INFO[id];
  return { id, name: i.name, role: i.role, job: i.job, home: i.home, room: i.home, status: 'off', progress: 0, via: crew };
}

export async function createRun(input: { candidate: BusinessCandidate; crew: CrewMode; ownerId?: string; ping?: boolean }) {
  const run: Run = {
    id: newId('run'),
    query: [input.candidate.name, input.candidate.address ?? input.candidate.city].filter(Boolean).join(', '),
    crew: input.crew,
    status: 'created',
    business: null,
    competitors: [],
    sources: [],
    agents: (['rosa', 'vic', 'june', 'otto', 'fern'] as AgentId[]).map((a) => agentFor(a, input.crew)),
    findings: [],
    fixes: [],
    totals: { findings: 0, estimatedMonthlyCents: 0, booksMonthlyCents: 0, oneTimeCents: 0, firstYearCents: 0, fixedFirstYearCents: 0 },
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    usage: { xaiCalls: 0, webSearches: 0, xPostsFetched: 0, pagesChecked: 0 },
    createdAt: nowIso(),
    lastSeq: 0,
  };
  const shift = newShift();
  if (input.ping) shift.ping = true;
  // Keep the lookup candidate so Rosa knows exactly which business was picked.
  (shift as unknown as { candidate: BusinessCandidate }).candidate = input.candidate;
  await insertRun(run, shift, { index: !input.ping });
  const { run: saved } = await mutate(run.id, ({ emit }) => emit('run.created', { query: run.query, crew: run.crew }));
  return saved;
}

export function candidateOf(shift: unknown): BusinessCandidate | undefined {
  return (shift as { candidate?: BusinessCandidate }).candidate;
}

export function agentOf(run: Run, id: AgentId): Agent {
  let a = run.agents.find((x) => x.id === id);
  if (!a) {
    a = agentFor(id, run.crew);
    run.agents.push(a);
  }
  return a;
}

/** 422 no_source unless every id is a registered source on this run. */
export function assertSources(run: Run, ids: string[], what = 'this') {
  if (!ids.length) throw new ApiErr('no_source', `Register a source with add_source first and pass its sourceId for ${what}`);
  const missing = ids.filter((id) => !run.sources.some((s) => s.id === id));
  if (missing.length) throw new ApiErr('no_source', `Unknown sourceId(s): ${missing.join(', ')}. Call add_source first and use the id it returns`);
}

export function addFinding(run: Run, f: NewFinding, emit: Emit): Finding {
  const finding: Finding = { id: newId('fnd'), ...f };
  run.findings.push(finding);
  emit('finding.created', { finding }, { agent: f.agent, room: f.room });
  return finding;
}

const SEV = { high: 0, medium: 1, low: 2 } as const;
export const bySeverity = (a: Finding, b: Finding) => SEV[a.severity] - SEV[b.severity];
