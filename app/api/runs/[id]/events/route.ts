import { after } from 'next/server';
import { ok, route } from '@/lib/http';
import { readEvents } from '@/lib/store';
import { tick } from '@/lib/crew/shift';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const after_ = Math.max(0, Number(new URL(req.url).searchParams.get('after') ?? 0) || 0);
  // The UI polls this every 700 ms, so it doubles as the shift watchdog.
  after(() => tick(id).catch((e) => console.error('[tick]', e)));
  return ok(await readEvents(id, after_));
});
