// The Grok Bot crew: each Bot has a routine with a webhook trigger. We POST it; 200 = the run started.
import type { AgentId, Run } from '../types';
import { config } from '../config';
import type { Job } from './shift';

export function botBody(job: Pick<Job, 'runId' | 'agent' | 'phase'>, run: Pick<Run, 'business'> | null, extra: Record<string, unknown> = {}) {
  const c = config();
  return {
    runId: job.runId,
    agent: job.agent,
    phase: job.phase,
    business: run?.business ?? null,
    mcpUrl: c.mcpUrl,
    instructions: `Use the afterhours-shift skill as ${job.agent}${job.agent === 'rosa' ? ` (phase ${job.phase})` : ''} for runId ${job.runId}. Call every afterhours tool with runId "${job.runId}" and agent "${job.agent}".`,
    ...extra,
  };
}

export async function postWebhook(agent: AgentId, body: unknown): Promise<{ ok: boolean; status?: number; error?: string }> {
  const hook = config().webhooks[agent];
  if (!hook) return { ok: false, error: 'no webhook configured' };
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${hook.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function triggerBot(job: Job, run: Run) {
  return postWebhook(job.agent, botBody(job, run));
}
