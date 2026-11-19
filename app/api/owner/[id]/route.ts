import { ApiErr, ok, route } from '@/lib/http';
import { getOwner } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const owner = await getOwner(id);
  if (!owner) throw new ApiErr('not_found', `No owner ${id}`);
  return ok(owner);
});
