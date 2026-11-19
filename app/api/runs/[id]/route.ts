import { ok, route } from '@/lib/http';
import { mustGetRun } from '@/lib/store';

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return ok(await mustGetRun(id));
});
