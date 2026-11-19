import type { Finding, Fix, Totals } from '../types';

const FIXED = new Set<Fix['status']>(['applied', 'sent']);

export function computeTotals(findings: Finding[], fixes: Fix[]): Totals {
  const t: Totals = { findings: findings.length, estimatedMonthlyCents: 0, booksMonthlyCents: 0, oneTimeCents: 0, firstYearCents: 0, fixedFirstYearCents: 0 };
  for (const f of findings) {
    const fixed = fixes.some((x) => x.findingId === f.id && FIXED.has(x.status));
    if (fixed) {
      t.fixedFirstYearCents += f.impact.firstYearCents;
      continue;
    }
    if (f.impact.basis === 'estimate') t.estimatedMonthlyCents += f.impact.monthlyCents;
    if (f.impact.basis === 'books') t.booksMonthlyCents += f.impact.monthlyCents;
    t.oneTimeCents += f.impact.oneTimeCents;
    t.firstYearCents += f.impact.firstYearCents;
  }
  return t;
}
