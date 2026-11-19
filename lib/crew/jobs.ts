import type { AgentId } from '../types';
import type { ShiftState } from '../store';

export type Phase = 'resolve' | 'report' | 'main';

export const jobKey = (agent: AgentId, phase: Phase) => `${agent}:${phase}`;

/** The job an agent is currently on, given where the shift is. */
export function currentJob(agent: AgentId, shift: ShiftState): string {
  if (agent === 'rosa') return jobKey('rosa', shift.phase === 'report' || shift.phase === 'closed' ? 'report' : 'resolve');
  return jobKey(agent, 'main');
}
