// Pick where the shift's events come from.
//   api     Advik's API: /api/runs, /api/runs/:id/events, /api/fixes/:id/approve
//   replay  REPLAY replaying data/demo/recorded-run.json (a real mock shift), approvals played locally.
//           No network: the design canvas uses it, and the app falls back to it.
//   auto    api if /api/health answers, otherwise replay
import recorded from './replay-data/plumb-recorded-run.json';
import { ApiCrew } from './api';
import { ReplayCrew } from './replay';
import type { Crew, CrewHooks, RecordedRun } from './types';

export type CrewSource = 'api' | 'replay' | 'auto' | 'demo';
export interface CrewOptions { source?: CrewSource; apiBase?: string; replay?: string | RecordedRun; sample?: string }

/** The recorded shift that ships with the app, so replay never needs the API. */
export const RECORDED = recorded as unknown as RecordedRun;

export function makeCrew(o: CrewOptions, hooks: CrewHooks): Crew {
  if (o.source === 'api') return new ApiCrew(hooks, o.apiBase ?? '', o.sample);
  return new ReplayCrew(hooks, o.replay ?? RECORDED);
}

/** For 'auto': ask the API first, fall back without making the presenter wait. */
export async function resolveAuto(o: CrewOptions, hooks: CrewHooks): Promise<Crew> {
  const api = new ApiCrew(hooks, o.apiBase ?? '', o.sample);
  try {
    await Promise.race([api.health(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 2500))]);
    return api;
  } catch {
    api.dispose();
    return new ReplayCrew(hooks, o.replay ?? RECORDED);
  }
}

export type { Crew, CrewHooks, RecordedRun } from './types';
