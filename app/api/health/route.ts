import { config } from '@/lib/config';
import { ok } from '@/lib/http';
import { ensureTelegramWebhook } from '@/lib/text/telegramSetup';

export const dynamic = 'force-dynamic';

export async function GET() {
  const c = config();
  const telegram = await ensureTelegramWebhook();
  return ok({
    ok: true,
    crew: c.crew,
    store: c.store,
    xai: !!c.xaiKey,
    grokbot: { webhooks: Object.keys(c.webhooks).length, bots: Object.keys(c.webhooks) },
    text: c.textChannel === 'off' ? 'off' : c.textChannel === 'imessage' ? (c.sendblueKeyId ? 'imessage' : 'off') : c.telegramToken ? 'telegram' : 'off',
    mail: c.resendKey ? 'resend' : 'off',
    mcpUrl: c.mcpUrl,
    agentToken: !!c.agentToken,
    telegramWebhook: telegram.ok ? 'set' : telegram.detail,
  });
}
