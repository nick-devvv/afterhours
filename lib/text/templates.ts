// Rosa's texts. Every $ figure comes from a finding's facts or the run's totals. ≤ 480 chars.
import type { Finding, Fix, Owner, Run } from '../types';
import { formatCents } from '../engine/money';
import { bySeverity } from '../runs';

const clip = (s: string, n = 480) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const first = (name?: string) => (name ?? '').split(' ')[0] || 'there';

export function welcome(owner: Owner) {
  return `Hi ${first(owner.name)}, it's Rosa from Afterhours. I run your night crew. I'll text when we find money leaking, and you can approve fixes by replying YES 1. Reply STOP anytime.`;
}

export function earlyAlert(run: Run, f: Finding) {
  const who = f.agent === 'vic' ? 'Vic' : f.agent === 'june' ? 'June' : f.agent === 'otto' ? 'Otto' : 'the crew';
  return clip(`Crew's still working on ${run.business?.name ?? 'your shop'}, but ${who} already found something: ${f.title}. More in a few minutes.`);
}

export function totalLine(run: Run) {
  const t = run.totals;
  const parts: string[] = [];
  if (t.booksMonthlyCents) parts.push(`${formatCents(t.booksMonthlyCents)}/mo from your books`);
  if (t.estimatedMonthlyCents) parts.push(`≈ ${formatCents(t.estimatedMonthlyCents)}/mo (estimate)`);
  return parts.join(' + ');
}

export function fixLine(fix: Fix) {
  return `${fix.number}) ${fix.title}`;
}

export function approval(run: Run) {
  const fixes = [...run.fixes].filter((f) => f.status === 'drafted').sort((a, b) => a.number - b.number);
  const n = run.findings.length;
  const total = totalLine(run);
  const head = `Done at ${run.business?.name ?? 'your shop'}. ${n} leak${n === 1 ? '' : 's'}${total ? `, ${total}` : ''}:`;
  const tail = fixes.length ? `Reply YES ${fixes[0].number}, NO ${fixes[0].number}, or ALL. Ask me anything.` : 'Nothing needs your OK tonight.';
  const lines: string[] = [];
  let budget = 480 - head.length - tail.length - 4;
  for (const f of fixes) {
    const l = fixLine(f).slice(0, 90);
    if (budget - l.length - 1 < 0) {
      lines.push(`…and ${fixes.length - lines.length} more in the app`);
      break;
    }
    lines.push(l);
    budget -= l.length + 1;
  }
  return clip([head, ...lines, tail].join('\n'));
}

export function confirm(fix: Fix, run: Run) {
  if (fix.status === 'applied' && fix.priceChange) {
    const item = run.business?.items.find((i) => i.id === fix.priceChange!.itemId);
    return `Done: ${item?.name ?? 'that item'} is now ${formatCents(fix.priceChange.toCents)} in your price list. Leak ${fix.number} patched.`;
  }
  if (fix.status === 'rejected') return `Got it, skipping ${fix.number}.`;
  return clip(`Done: fix ${fix.number} is approved.${fix.body ? ` Here's the text to post:\n${fix.body}` : ''}`);
}

export function details(run: Run, fix: Fix) {
  const f = run.findings.find((x) => x.id === fix.findingId);
  if (!f) return `I can't find fix ${fix.number}.`;
  const src = run.sources.filter((s) => f.sourceIds.includes(s.id)).slice(0, 2).map((s) => s.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60));
  const assumption = f.impact.basis === 'estimate' ? ` ${f.impact.assumptions[0] ?? ''}` : '';
  return clip(`${fix.number}) ${f.title}. ${f.detail.split('. ')[0]}.${assumption} Sources: ${src.join(', ') || 'in the app'}. Reply YES ${fix.number} or NO ${fix.number}.`);
}

export function topFinding(run: Run) {
  return [...run.findings].sort(bySeverity)[0];
}
