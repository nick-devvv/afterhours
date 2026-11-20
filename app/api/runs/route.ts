import { z } from 'zod';
import { config } from '@/lib/config';
import { ApiErr, body, ok, route } from '@/lib/http';
import { createRun } from '@/lib/runs';
import { getOwner, getRun, listRunIds, saveOwner } from '@/lib/store';
import { defaultOwnerId } from '@/lib/text/defaultOwner';

const Candidate = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  website: z.string().url().optional(),
  sourceUrl: z.string().url(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const POST = route(async (req: Request) => {
  const input = z.object({ candidate: Candidate, ownerId: z.string().optional(), crew: z.enum(['api', 'grokbot']).optional() }).parse(await body(req));
  // No owner from the page: Rosa texts the team's own Telegram chat (OWNER_TELEGRAM_CHAT_ID), if set.
  const ownerId = input.ownerId ?? (await defaultOwnerId());
  const owner = ownerId ? await getOwner(ownerId) : null;
  if (input.ownerId && !owner) throw new ApiErr('not_found', `No owner ${input.ownerId}`);
  const run = await createRun({ candidate: input.candidate, crew: input.crew ?? config().crew, ownerId: owner?.id });
  if (owner) {
    owner.runIds.push(run.id);
    await saveOwner(owner);
  }
  return ok(run, 201);
});

export const GET = route(async (req: Request) => {
  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 20) || 20, 50);
  const runs = (await Promise.all((await listRunIds(limit)).map(getRun))).filter(Boolean).map((r) => ({ ...r!, sources: [] }));
  return ok({ runs });
});
