import { after } from 'next/server';
import { z } from 'zod';
import { body, ok, requireAgentToken, route } from '@/lib/http';
import { runAgent } from '@/lib/crew/api';
import { AgentIdSchema } from '@/lib/tools/define';

export const maxDuration = 300;

/** Internal: runs one API-crew agent in its own invocation. Called by lib/crew/shift.ts. */
export const POST = route(async (req: Request) => {
  requireAgentToken(req);
  const job = z.object({ runId: z.string(), agent: AgentIdSchema, phase: z.enum(['resolve', 'report', 'main']) }).parse(await body(req));
  after(() => runAgent(job.runId, job.agent, job.phase).catch((e) => console.error('[crew/run]', e)));
  return ok({ ok: true }, 202);
});
