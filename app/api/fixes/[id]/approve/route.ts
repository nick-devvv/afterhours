import { ok, route } from '@/lib/http';
import { approveFix } from '@/lib/fixes';

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return ok((await approveFix(id, 'web')).fix);
});
