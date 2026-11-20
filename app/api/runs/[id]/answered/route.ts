import { ok, route } from '@/lib/http';
import { callAnswered } from '@/lib/text/send';

export const maxDuration = 30;

// The owner answered Rosa's on-screen call. Telegram texts for this run start from here.
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return ok(await callAnswered(id));
});
