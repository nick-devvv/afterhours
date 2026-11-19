import { after } from 'next/server';
import { ok, route } from '@/lib/http';
import { mustGetRun } from '@/lib/store';
import { startRun } from '@/lib/crew/shift';

export const maxDuration = 60;

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const run = await mustGetRun(id);
  // startRun takes the lock and throws 409 if the run already started; launching happens after the response.
  let triggered: 'api' | 'grokbot' = run.crew;
  const started = startRun(id).then((r) => (triggered = r.triggered));
  after(() => started.catch((e) => console.error('[start]', e)));
  await Promise.race([started, new Promise((r) => setTimeout(r, 1500))]);
  return ok({ ok: true, crew: run.crew, triggered });
});
