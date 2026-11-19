import { ApiErr, ok, route } from '@/lib/http';
import { getOwner } from '@/lib/store';
import { allowlisted } from '@/lib/text/send';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const owner = await getOwner(id);
  if (!owner) throw new ApiErr('not_found', `No owner ${id}`);
  // textable: whether Rosa is allowed to text this owner right now (allowlist / self-linked, not STOPped).
  return ok({ ...owner, textable: allowlisted(owner) && !owner.stopped });
});
