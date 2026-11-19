// Registers our Telegram webhook from the server's own settings, so nobody has to paste the bot token
// into a URL. Called from /api/health and /api/owner; once per server instance is enough (setWebhook is
// idempotent). Never returns or logs the token.
import { config } from '../config';

let done: Promise<{ ok: boolean; detail: string }> | null = null;

export function ensureTelegramWebhook() {
  const c = config();
  if (c.textChannel !== 'telegram' || !c.telegramToken) return Promise.resolve({ ok: false, detail: 'telegram not configured' });
  if (!done) {
    done = (async () => {
      try {
        const body = new URLSearchParams({ url: `${c.publicUrl}/api/text/telegram`, allowed_updates: JSON.stringify(['message']) });
        if (c.telegramSecret) body.set('secret_token', c.telegramSecret);
        const r = await fetch(`https://api.telegram.org/bot${c.telegramToken}/setWebhook`, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
        const res = { ok: !!j?.ok, detail: j?.description ?? `HTTP ${r.status}` };
        if (!res.ok) done = null;   // try again on the next call
        return res;
      } catch (e) {
        done = null;
        return { ok: false, detail: (e as Error).message };
      }
    })();
  }
  return done;
}

/** A plain reply to a chat we don't know yet (someone tapped Start without coming from the site). */
export async function replyToChat(chatId: string, text: string) {
  const c = config();
  if (!c.telegramToken) return;
  await fetch(`https://api.telegram.org/bot${c.telegramToken}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }), signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
