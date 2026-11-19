import { after } from 'next/server';
import { ok } from '@/lib/http';
import { findOwner, saveOwner } from '@/lib/store';
import { handleInbound } from '@/lib/text/inbound';
import { sendText } from '@/lib/text/send';
import { welcome } from '@/lib/text/templates';

export const maxDuration = 60;

/** Sendblue inbound webhook. The first text from an owner's number verifies them (free plan rule). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { from_number?: string; number?: string; content?: string; is_outbound?: boolean };
  if (b.is_outbound) return ok({ ok: true });
  const from = b.from_number ?? b.number;
  const text = b.content?.trim();
  if (!from || !text) return ok({ ok: true });
  after(async () => {
    try {
      const owner = await findOwner({ phone: from });
      if (!owner) return;
      if (!owner.verified) {
        owner.verified = true;
        await saveOwner(owner);
        await sendText(owner, welcome(owner), { kind: 'welcome', reply: true });
        return;
      }
      await handleInbound(owner, text);
    } catch (e) {
      console.error('[sendblue]', e);
    }
  });
  return ok({ ok: true });
}
