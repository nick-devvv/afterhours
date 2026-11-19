import { config } from '@/lib/config';
import { ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const c = config();
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
  });
}
