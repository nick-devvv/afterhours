// Underpriced rules (MVP_SPEC section 9). Pure.
import type { Business, Competitor, Finding, MenuItem } from '../types';
import { floorToQuarter, formatCents, median } from './money';

export const DEFAULT_UNITS_PER_DAY = 20;

export type NewFinding = Omit<Finding, 'id'>;

export interface UnderpricedInput {
  item: MenuItem;
  ours: number;
  /** one price per competitor, matched to this item */
  comps: { name: string; priceCents: number; sourceId: string }[];
}

/** Returns the recommended price, or null when the rules say don't flag. */
export function recommend(ours: number, compPrices: number[]): { median: number; recommended: number } | null {
  if (compPrices.length < 2) return null;
  const med = median(compPrices);
  if (!(ours <= med * 0.92 && med - ours >= 25)) return null;
  const recommended = Math.min(floorToQuarter(med), Math.max(...compPrices));
  if (recommended <= ours) return null;
  return { median: med, recommended };
}

export function severityFor(monthlyCents: number): Finding['severity'] {
  return monthlyCents >= 30_000 ? 'high' : monthlyCents >= 10_000 ? 'medium' : 'low';
}

export function underpricedFindings(
  business: Business,
  competitors: Competitor[],
  unitsPerDay: Record<string, { n: number; basis: 'books' | 'owner' }> = {},
): NewFinding[] {
  const out: NewFinding[] = [];
  for (const item of business.items) {
    const comps: UnderpricedInput['comps'] = [];
    for (const c of competitors) {
      const m = c.items.find((i) => i.matchesItemId === item.id);
      if (m) comps.push({ name: c.name, priceCents: m.priceCents, sourceId: m.sourceId });
    }
    const rec = recommend(item.priceCents, comps.map((c) => c.priceCents));
    if (!rec) continue;
    const known = unitsPerDay[item.id];
    const units = known?.n ?? DEFAULT_UNITS_PER_DAY;
    const basis = known?.basis === 'books' ? 'books' : 'estimate';
    const monthly = (rec.recommended - item.priceCents) * units * 30;
    const label = item.size ? `${item.size} ${item.name}` : item.name;
    const assumption = known
      ? `Uses ${units} sold a day${known.basis === 'books' ? ' from your sales export' : ', the number you gave us'}.`
      : `Assumes ${units} sold a day. Text me the real number and I'll redo it.`;
    out.push({
      kind: 'underpriced',
      agent: 'vic',
      room: 'shop_floor',
      title: `${item.name} is ${formatCents(rec.median - item.priceCents)} under the street`,
      detail: `${comps.length} nearby shops charge a median of ${formatCents(rec.median)} for ${label}; you charge ${formatCents(item.priceCents)}. ${assumption}`,
      severity: severityFor(monthly),
      impact: {
        basis,
        oneTimeCents: 0,
        monthlyCents: monthly,
        firstYearCents: monthly * 12,
        assumptions: [assumption, `Recommended price is the street median rounded down to the nearest $0.25.`],
        inputs: { unitsPerDay: units },
      },
      facts: {
        item: item.name,
        ours: formatCents(item.priceCents),
        median: formatCents(rec.median),
        recommended: formatCents(rec.recommended),
        gap: formatCents(rec.median - item.priceCents),
        increase: formatCents(rec.recommended - item.priceCents),
        monthly: formatCents(monthly),
        competitors: comps.map((c) => `${c.name} ${formatCents(c.priceCents)}`).join(' · '),
      },
      sourceIds: [item.sourceId, ...comps.map((c) => c.sourceId)].filter((v, i, a) => a.indexOf(v) === i),
      fix: { type: 'price_change', itemId: item.id, fromCents: item.priceCents, toCents: rec.recommended },
    });
  }
  return out;
}
