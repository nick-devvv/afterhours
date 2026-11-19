import { z } from 'zod';
import { body, ok, route } from '@/lib/http';
import { lookup } from '@/lib/lookup';

export const maxDuration = 60;

export const POST = route(async (req: Request) => {
  const { query } = z.object({ query: z.string().min(2).max(200) }).parse(await body(req));
  return ok({ candidates: await lookup(query) });
});
