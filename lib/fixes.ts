// Approving and rejecting fixes. The UI routes and the text commands both call these.
import type { Fix, Run } from './types';
import { config } from './config';
import { ApiErr } from './http';
import { mutate, runIdForFix } from './store';

async function runIdOf(fixId: string) {
  const runId = await runIdForFix(fixId);
  if (!runId) throw new ApiErr('not_found', `No fix ${fixId}`);
  return runId;
}

function settle(run: Run) {
  if (run.status === 'awaiting_approval' && run.fixes.every((f) => f.status !== 'drafted')) run.status = 'done';
}

async function email(fix: Fix): Promise<{ ok: boolean; error?: string }> {
  const c = config();
  if (!fix.to || !c.resendKey || !c.mailFrom) return { ok: false, error: 'email not configured' };
  if (!c.mailAllowlist.includes(fix.to.toLowerCase())) return { ok: false, error: `${fix.to} not in MAIL_ALLOWLIST` };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${c.resendKey}` },
    body: JSON.stringify({ from: c.mailFrom, to: [fix.to], subject: fix.subject ?? fix.title, text: fix.body ?? fix.title }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e: Error) => ({ ok: false, status: 0, statusText: e.message }) as Response);
  return res.ok ? { ok: true } : { ok: false, error: `Resend ${res.status} ${res.statusText}` };
}

export async function approveFix(fixId: string, via: 'web' | 'text' = 'web'): Promise<{ fix: Fix; run: Run }> {
  const runId = await runIdOf(fixId);
  const pre = await mutate(runId, ({ run }) => run.fixes.find((f) => f.id === fixId));
  const emailed = pre.result?.to && pre.result.status === 'drafted' ? await email(pre.result) : null;
  const { run, result } = await mutate(runId, ({ run, emit }) => {
    const fix = run.fixes.find((f) => f.id === fixId);
    if (!fix) throw new ApiErr('not_found', `No fix ${fixId}`);
    if (fix.status !== 'drafted') return fix; // idempotent: YES 2 twice is fine
    fix.status = 'approved';
    fix.decidedVia = via;
    emit('fix.approved', { fixId, via }, { agent: 'rosa', room: 'front_desk' });
    if (fix.type === 'price_change' && fix.priceChange && run.business) {
      const item = run.business.items.find((i) => i.id === fix.priceChange!.itemId);
      if (item) {
        item.priceCents = fix.priceChange.toCents;
        fix.status = 'applied';
        fix.sentVia = 'ledger';
        emit('fix.applied', { fixId, itemId: item.id, fromCents: fix.priceChange.fromCents, toCents: fix.priceChange.toCents }, { agent: 'fern', room: 'shop_floor' });
      } else {
        fix.status = 'failed';
        fix.error = 'Item no longer in the price list';
        emit('fix.failed', { fixId, error: fix.error }, { agent: 'fern' });
      }
    } else if (emailed) {
      fix.status = emailed.ok ? 'sent' : 'failed';
      fix.sentVia = 'resend';
      if (!emailed.ok) fix.error = emailed.error;
      emit(emailed.ok ? 'fix.sent' : 'fix.failed', emailed.ok ? { fixId, via: 'resend' } : { fixId, error: emailed.error }, { agent: 'fern', room: 'mailroom' });
    } else {
      fix.status = 'sent';
      fix.sentVia = 'copy';
      emit('fix.sent', { fixId, via: 'copy' }, { agent: 'fern', room: 'mailroom' });
    }
    settle(run);
    return fix;
  });
  return { fix: result, run };
}

export async function rejectFix(fixId: string, via: 'web' | 'text' = 'web'): Promise<{ fix: Fix; run: Run }> {
  const runId = await runIdOf(fixId);
  const { run, result } = await mutate(runId, ({ run, emit }) => {
    const fix = run.fixes.find((f) => f.id === fixId);
    if (!fix) throw new ApiErr('not_found', `No fix ${fixId}`);
    if (fix.status !== 'drafted') return fix;
    fix.status = 'rejected';
    fix.decidedVia = via;
    emit('fix.rejected', { fixId, via }, { agent: 'rosa', room: 'front_desk' });
    settle(run);
    return fix;
  });
  return { fix: result, run };
}
