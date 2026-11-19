/** Run totals. Only lib/engine computes amounts. */
import type { Finding, Fix, Totals } from './engine-types';

/** A finding counts as recovered once its fix is sent (email) or applied (price). */
const RECOVERED: ReadonlySet<Fix['status']> = new Set(['sent', 'applied']);

export function computeTotals(
  findings: readonly Finding[],
  fixes: readonly Fix[],
): Totals {
  const recoveredFindingIds = new Set(
    fixes.filter((f) => RECOVERED.has(f.status)).map((f) => f.findingId),
  );

  let leakingCents = 0;
  let recoveredCents = 0;
  let oneTimeCents = 0;
  let monthlyCents = 0;

  for (const f of findings) {
    oneTimeCents += f.oneTimeCents;
    monthlyCents += f.monthlyCents;
    if (recoveredFindingIds.has(f.id)) recoveredCents += f.firstYearCents;
    else leakingCents += f.firstYearCents;
  }

  return { leakingCents, recoveredCents, oneTimeCents, monthlyCents, findings: findings.length };
}
