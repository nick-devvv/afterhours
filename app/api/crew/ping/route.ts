import { z } from 'zod';
import { config, CREW_AGENTS } from '@/lib/config';
import { body, ok, requireAgentToken, route } from '@/lib/http';
import { createRun } from '@/lib/runs';
import { botBody, postWebhook } from '@/lib/crew/grokbot';
import { AgentIdSchema } from '@/lib/tools/define';

export const maxDuration = 60;

/** Pings each Grok Bot's routine webhook. Bots answer by calling `status` "pong" on the ping run. Poll /api/runs/<runId>/events. */
export const POST = route(async (req: Request) => {
  requireAgentToken(req);
  const { agents } = z.object({ agents: z.array(AgentIdSchema).optional() }).parse(await body(req));
  const run = await createRun({ crew: 'grokbot', ping: true, candidate: { name: 'Grok Bot ping', sourceUrl: config().publicUrl, confidence: 'low' } });
  const targets = (agents ?? CREW_AGENTS).filter((a) => config().webhooks[a]);
  const results = await Promise.all(targets.map(async (a) => ({ agent: a, ...(await postWebhook(a, botBody({ runId: run.id, agent: a, phase: 'main' }, null, { ping: true }))) })));
  return ok({ runId: run.id, results, missing: CREW_AGENTS.filter((a) => !config().webhooks[a]) });
});
