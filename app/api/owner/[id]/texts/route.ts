import { ok, route } from '@/lib/http';
import { listTexts } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const runId = new URL(req.url).searchParams.get('runId') ?? undefined;
  return ok({ messages: await listTexts(id, runId) });
});
