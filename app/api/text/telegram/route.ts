import { after } from 'next/server';
import { config } from '@/lib/config';
import { fail, ok } from '@/lib/http';
import { findOwner, getOwner, saveOwner } from '@/lib/store';
import { handleInbound } from '@/lib/text/inbound';
import { sendText, allowlisted } from '@/lib/text/send';
import { welcome } from '@/lib/text/templates';

export const maxDuration = 60;

/** Telegram Bot API webhook. Register once: setWebhook { url: PUBLIC_URL/api/text/telegram, secret_token }. */
export async function POST(req: Request) {
  const c = config();
  if (c.telegramSecret && req.headers.get('x-telegram-bot-api-secret-token') !== c.telegramSecret) return fail('unauthorized', 'bad secret');
  const update = (await req.json().catch(() => ({}))) as { message?: { text?: string; chat?: { id?: number | string } } };
  const text = update.message?.text?.trim();
  const chatId = update.message?.chat?.id != null ? String(update.message.chat.id) : undefined;
  if (!text || !chatId) return ok({ ok: true });

  after(async () => {
    try {
      const start = text.match(/^\/start\s+(\S+)/);
      if (start) {
        const owner = await getOwner(start[1]);
        if (!owner) return;
        owner.telegramChatId = chatId;
        owner.channel = 'telegram';
        owner.verified = true;
        await saveOwner(owner);
        if (!allowlisted(owner)) console.warn(`[telegram] chat ${chatId} linked to ${owner.id} but is not in TEXT_ALLOWLIST; add it to text this owner`);
        await sendText(owner, welcome(owner), { kind: 'welcome', reply: true });
        return;
      }
      const owner = await findOwner({ telegramChatId: chatId });
      if (!owner) {
        console.warn(`[telegram] message from unknown chat ${chatId}`);
        return;
      }
      await handleInbound(owner, text);
    } catch (e) {
      console.error('[telegram]', e);
    }
  });
  return ok({ ok: true });
}
