// Typed settings, read from env on every call so tests can change process.env.
import type { AgentId, CrewMode } from './types';

const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const CREW_AGENTS: AgentId[] = ['rosa', 'vic', 'june', 'otto', 'fern'];

export function config() {
  // Trim every value: a key pasted with a trailing space or newline must still work.
  const e: Record<string, string | undefined> = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
  const webhooks: Partial<Record<AgentId, { url: string; key: string }>> = {};
  for (const a of CREW_AGENTS) {
    const url = e[`GROKBOT_WEBHOOK_${a.toUpperCase()}`];
    const key = e[`GROKBOT_KEY_${a.toUpperCase()}`];
    if (url && key) webhooks[a] = { url, key };
  }
  const publicUrl = (e.PUBLIC_URL || (e.VERCEL_PROJECT_PRODUCTION_URL ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/$/, '');
  return {
    crew: (e.CREW === 'grokbot' ? 'grokbot' : 'api') as CrewMode,
    store: (e.STORE === 'redis' || (!e.STORE && e.UPSTASH_REDIS_REST_URL) ? 'redis' : 'memory') as 'redis' | 'memory',
    redisUrl: e.UPSTASH_REDIS_REST_URL || e.KV_REST_API_URL || '',
    redisToken: e.UPSTASH_REDIS_REST_TOKEN || e.KV_REST_API_TOKEN || '',
    xaiKey: e.XAI_API_KEY || '',
    xaiModel: e.XAI_MODEL || 'grok-4.7',
    publicUrl,
    mcpUrl: `${publicUrl}/api/mcp`,
    agentToken: e.AFTERHOURS_AGENT_TOKEN || '',
    production: e.NODE_ENV === 'production',
    webhooks,
    textChannel: (['telegram', 'imessage', 'off'].includes(e.TEXT_CHANNEL ?? '') ? e.TEXT_CHANNEL : 'telegram') as 'telegram' | 'imessage' | 'off',
    telegramToken: e.TELEGRAM_BOT_TOKEN || '',
    telegramUsername: e.TELEGRAM_BOT_USERNAME || '',
    telegramSecret: e.TELEGRAM_WEBHOOK_SECRET || '',
    sendblueKeyId: e.SENDBLUE_API_KEY_ID || '',
    sendblueSecret: e.SENDBLUE_API_SECRET || '',
    sendblueFrom: e.SENDBLUE_FROM || '',
    textAllowlist: list(e.TEXT_ALLOWLIST),
    /** true: an owner who opened our Telegram link and pressed Start can be texted without being in TEXT_ALLOWLIST.
     *  They linked their own chat to their own owner id, so it's still never a third party. */
    textAllowSelfLinked: e.TEXT_ALLOW_SELF_LINKED === 'true',
    resendKey: e.RESEND_API_KEY || '',
    mailFrom: e.MAIL_FROM || '',
    mailAllowlist: list(e.MAIL_ALLOWLIST).map((s) => s.toLowerCase()),
    cronSecret: e.CRON_SECRET || '',
    /** API crew budget per agent */
    apiBudgetMs: Number(e.AGENT_BUDGET_MS || 150_000),
    apiMaxSteps: Number(e.AGENT_MAX_STEPS || 12),
  };
}

export type Config = ReturnType<typeof config>;
