// Sending texts: Telegram (today) or iMessage via Sendblue, behind the guardrails.
import type { Owner, TextMessage } from '../types';
import { config } from '../config';
import { ApiErr } from '../http';
import { newId, nowIso } from '../ids';
import { getOwner, getRecord, mutate, saveText } from '../store';
import { allowedCents, badFigures } from '../engine/drafts';
import { formatCents } from '../engine/money';
import * as T from './templates';

export const MAX_TEXTS_PER_RUN = 6;

export function allowlisted(owner: Owner) {
  const c = config();
  const list = c.textAllowlist;
  if (owner.phone && list.includes(owner.phone)) return true;
  if (owner.telegramChatId && list.includes(owner.telegramChatId)) return true;
  // Self-linked Telegram owners: verified only by tapping t.me/<bot>?start=<ownerId> and pressing Start.
  return c.textAllowSelfLinked && owner.channel === 'telegram' && owner.verified && !!owner.telegramChatId;
}

export function inQuietHours(owner: Owner, now = new Date()) {
  const hhmm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: owner.timezone || 'America/Los_Angeles' }).format(now);
  const { from, to } = owner.quiet ?? { from: '21:00', to: '07:00' };
  if (from === to) return false;
  return from < to ? hhmm >= from && hhmm < to : hhmm >= from || hhmm < to;
}

async function deliver(owner: Owner, body: string): Promise<{ ok: boolean; error?: string }> {
  const c = config();
  if (c.textChannel === 'off') return { ok: false, error: 'texting is off (TEXT_CHANNEL=off)' };
  try {
    if (owner.channel === 'telegram') {
      if (!c.telegramToken) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
      if (!owner.telegramChatId) return { ok: false, error: 'owner has not tapped Start in Telegram yet' };
      const res = await fetch(`https://api.telegram.org/bot${c.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: owner.telegramChatId, text: body, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      return j.ok ? { ok: true } : { ok: false, error: j.description ?? `HTTP ${res.status}` };
    }
    if (!c.sendblueKeyId || !owner.phone) return { ok: false, error: 'Sendblue not configured or no phone' };
    const res = await fetch('https://api.sendblue.co/api/send-message', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sb-api-key-id': c.sendblueKeyId, 'sb-api-secret-key': c.sendblueSecret },
      body: JSON.stringify({ number: owner.phone, content: body, ...(c.sendblueFrom ? { from_number: c.sendblueFrom } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `Sendblue HTTP ${res.status}: ${(await res.text()).slice(0, 160)}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Send one text with every guardrail. reply = answering the owner's own message (skips quiet hours and the per-run cap). */
export async function sendText(owner: Owner, body: string, opts: { runId?: string; kind: NonNullable<TextMessage['kind']>; reply?: boolean }): Promise<TextMessage> {
  const msg: TextMessage = {
    id: newId('txt'),
    ownerId: owner.id,
    ...(opts.runId ? { runId: opts.runId } : {}),
    direction: 'out',
    body: body.slice(0, 480),
    at: nowIso(),
    channel: owner.channel,
    status: 'queued',
    kind: opts.kind,
    from: 'rosa',
  };
  let blocked: string | undefined;
  if (!allowlisted(owner)) blocked = 'not in TEXT_ALLOWLIST';
  else if (owner.stopped && !opts.reply) blocked = 'owner replied STOP';
  else if (!opts.reply && inQuietHours(owner) && opts.kind !== 'approval' && opts.kind !== 'welcome') blocked = 'quiet hours';

  if (opts.runId && !opts.reply && !blocked) {
    const { result } = await mutate(opts.runId, ({ shift }) => {
      if (shift.textsSent >= MAX_TEXTS_PER_RUN) return false;
      shift.textsSent++;
      return true;
    });
    if (!result) blocked = `already sent ${MAX_TEXTS_PER_RUN} texts this run`;
  }

  if (blocked) {
    msg.status = 'failed';
    msg.error = blocked;
  } else {
    const r = await deliver(owner, msg.body);
    msg.status = r.ok ? 'sent' : 'failed';
    if (r.error) msg.error = r.error;
  }
  await saveText(msg);
  if (opts.runId)
    await mutate(opts.runId, ({ emit }) => {
      emit('text.sent', { message: msg }, { agent: 'rosa', room: 'front_desk' });
      if (msg.status === 'failed') emit('agent.status', { message: `Couldn't text the owner: ${msg.error}`, progress: 100 }, { agent: 'rosa', room: 'front_desk' });
    }).catch(() => {});
  return msg;
}

/** The text_owner tool. Checks figures against the run's facts and totals. */
export async function sendRunText(runId: string, body: string, kind: NonNullable<TextMessage['kind']>) {
  const rec = await getRecord(runId);
  if (!rec) throw new ApiErr('not_found', `No run ${runId}`);
  const { run } = rec;
  if (!run.ownerId) return { sent: false, reason: 'No owner is linked to this run, so there is nobody to text. That is fine; call done.' };
  const owner = await getOwner(run.ownerId);
  if (!owner) return { sent: false, reason: 'Owner not found' };
  if (!rec.shift.callAnswered) return { sent: false, reason: 'The owner has not answered the call on screen yet. Texts go out after they answer. Call done.' };
  const t = run.totals;
  const totals = Object.fromEntries(Object.entries(t).filter(([k]) => k.endsWith('Cents')).map(([k, v]) => [k, formatCents(v as number)]));
  const bad = badFigures([body], allowedCents(totals, ...run.findings.map((f) => f.facts)));
  if (bad.length) throw new ApiErr('bad_draft', `These figures aren't in the run's facts or totals: ${bad.join(', ')}. Copy them exactly from get_run.`);
  const msg = await sendText(owner, body, { runId, kind });
  if (msg.status === 'sent' && kind === 'approval') await mutate(runId, ({ shift }) => void (shift.approvalSent = true));
  if (msg.status === 'sent' && kind === 'alert') await mutate(runId, ({ shift }) => void (shift.earlyAlertSent = true));
  return { sent: msg.status === 'sent', messageId: msg.id, ...(msg.error ? { error: msg.error } : {}) };
}

/** After Rosa's report: if she didn't manage to text the numbered list, send the template. */
export async function ensureApprovalText(runId: string) {
  const rec = await getRecord(runId);
  if (!rec || rec.shift.approvalSent || !rec.shift.callAnswered || !rec.run.ownerId || rec.shift.phase !== 'closed') return;
  if (!rec.run.fixes.some((f) => f.status === 'drafted')) return;
  const owner = await getOwner(rec.run.ownerId);
  if (!owner) return;
  const msg = await sendText(owner, T.approval(rec.run), { runId, kind: 'approval' });
  if (msg.status === 'sent') await mutate(runId, ({ shift }) => void (shift.approvalSent = true));
}

/** First high-severity finding → one early heads-up, once per run. */
export async function maybeEarlyAlert(runId: string) {
  const rec = await getRecord(runId);
  if (!rec || rec.shift.earlyAlertSent || !rec.shift.callAnswered || !rec.run.ownerId) return;
  const f = rec.run.findings.find((x) => x.severity === 'high');
  if (!f) return;
  const { result } = await mutate(runId, ({ shift }) => {
    if (shift.earlyAlertSent) return false;
    shift.earlyAlertSent = true;
    return true;
  });
  if (!result) return;
  const owner = await getOwner(rec.run.ownerId);
  if (owner) await sendText(owner, T.earlyAlert(rec.run, f), { runId, kind: 'alert' });
}

/** The owner answered Rosa's on-screen call: texts are allowed from now on. Sends the heads-up for the
 *  biggest finding so far, and the approval list if the shift already closed. */
export async function callAnswered(runId: string) {
  const rec = await getRecord(runId);
  if (!rec) throw new ApiErr('not_found', `No run ${runId}`);
  if (!rec.shift.callAnswered) await mutate(runId, ({ shift }) => void (shift.callAnswered = true));
  const fresh = await getRecord(runId);
  if (fresh && !fresh.shift.earlyAlertSent && fresh.run.ownerId && fresh.run.findings.length) {
    const f = fresh.run.findings.find((x) => x.severity === 'high') ?? fresh.run.findings[0];
    const { result } = await mutate(runId, ({ shift }) => { if (shift.earlyAlertSent) return false; shift.earlyAlertSent = true; return true; });
    const owner = result ? await getOwner(fresh.run.ownerId) : null;
    if (owner) await sendText(owner, T.earlyAlert(fresh.run, f), { runId, kind: 'alert' });
  }
  await ensureApprovalText(runId);
  return { ok: true };
}
