import { describe, expect, it } from 'vitest';
import { formatCents, parseCents, floorToQuarter, median } from '../lib/engine/money';
import { recommend, underpricedFindings } from '../lib/engine/prices';
import { allowedCents, badFigures, dollarFigures } from '../lib/engine/drafts';
import { computeTotals } from '../lib/engine/totals';
import { listingsDisagree, normalizePhone, parseHours } from '../lib/engine/listings';
import { reviewThemeFinding } from '../lib/engine/reviews';
import type { Business, Competitor } from '../lib/types';

describe('money', () => {
  it('parses and formats', () => {
    expect(parseCents('$4.50')).toBe(450);
    expect(parseCents('4.5')).toBe(450);
    expect(parseCents('1,234.56')).toBe(123456);
    expect(parseCents('abc')).toBeNull();
    expect(formatCents(450)).toBe('$4.50');
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(floorToQuarter(549)).toBe(525);
    expect(median([500, 525, 550])).toBe(525);
    expect(median([500, 550])).toBe(525);
  });
});

const biz = (price: number): Business => ({ id: 'b', name: 'Us', items: [{ id: 'item_1', name: 'Cold Brew', size: '16 oz', priceCents: price, sourceId: 'src_1' }], sourceIds: ['src_1'] });
const comp = (name: string, price: number, match = 'item_1'): Competitor => ({ id: name, name, items: [{ id: `${name}_1`, name: 'Cold Brew', priceCents: price, sourceId: `src_${name}`, matchesItemId: match }], sourceIds: [`src_${name}`] });

describe('underpriced rules', () => {
  it('flags an item well under the street with exact facts', () => {
    const [f] = underpricedFindings(biz(450), [comp('A', 550), comp('B', 525), comp('C', 500)]);
    expect(f.facts).toMatchObject({ ours: '$4.50', median: '$5.25', recommended: '$5.25', gap: '$0.75' });
    expect(f.impact.basis).toBe('estimate');
    expect(f.impact.monthlyCents).toBe(75 * 20 * 30);
    expect(f.severity).toBe('high');
    expect(f.fix).toMatchObject({ type: 'price_change', itemId: 'item_1', fromCents: 450, toCents: 525 });
    expect(f.detail).toMatch(/Assumes 20 sold a day/);
  });
  it('must not flag an item 3% under the median', () => {
    expect(underpricedFindings(biz(509), [comp('A', 525), comp('B', 525)])).toHaveLength(0);
  });
  it('must not flag with only one competitor price', () => {
    expect(underpricedFindings(biz(300), [comp('A', 600)])).toHaveLength(0);
  });
  it('must not flag when unmatched (different size)', () => {
    expect(underpricedFindings(biz(300), [comp('A', 600, 'item_9'), comp('B', 600, 'item_9')])).toHaveLength(0);
  });
  it('must not flag when the recommendation would not be above ours', () => {
    expect(recommend(500, [520, 530])).toBeNull();
  });
  it('never recommends above the highest competitor', () => {
    expect(recommend(400, [480, 600, 480])!.recommended).toBeLessThanOrEqual(600);
  });
});

describe('drafts (bad_draft check)', () => {
  const facts = { ours: '$4.50', recommended: '$5.25', competitors: 'A $5.50 · B $5.00' };
  it('accepts exact figures', () => {
    expect(badFigures(['Raise Cold Brew from $4.50 to $5.25'], allowedCents(facts))).toEqual([]);
  });
  it('rejects an invented figure', () => {
    expect(badFigures(['Raise Cold Brew from $4.50 to $5.50 and earn $900/mo'], allowedCents({ ours: '$4.50', recommended: '$5.25' }))).toEqual(['$5.50', '$900']);
  });
  it('reads commas', () => {
    expect(dollarFigures('$1,350.00')[0].cents).toBe(135000);
  });
});

describe('totals', () => {
  it('sums open findings by basis and moves fixed ones', () => {
    const [f] = underpricedFindings(biz(450), [comp('A', 550), comp('B', 525)]);
    const finding = { id: 'f1', ...f };
    const open = computeTotals([finding], []);
    expect(open.estimatedMonthlyCents).toBe(f.impact.monthlyCents);
    const fixed = computeTotals([finding], [{ id: 'x', number: 1, findingId: 'f1', type: 'price_change', status: 'applied', title: 't', draftedBy: 'fern' }]);
    expect(fixed.estimatedMonthlyCents).toBe(0);
    expect(fixed.fixedFirstYearCents).toBe(f.impact.firstYearCents);
  });
});

describe('listings', () => {
  it('normalizes phones', () => {
    expect(normalizePhone('(415) 555-0123')).toBe('+14155550123');
    expect(normalizePhone('+1 415.555.0123')).toBe('+14155550123');
  });
  it('parses hours', () => {
    expect(parseHours('Mon–Fri 7am–5pm, Sat 8am-3pm')).toEqual({ mon: '07:00-17:00', tue: '07:00-17:00', wed: '07:00-17:00', thu: '07:00-17:00', fri: '07:00-17:00', sat: '08:00-15:00' });
    expect(parseHours('Daily 7-5')!.sun).toBe('07:00-17:00');
    expect(parseHours('Sunday: Closed')).toEqual({ sun: 'closed' });
  });
  it('finds a real hours mismatch and ignores formatting differences', () => {
    const v = (label: string, text: string, sourceId: string) => ({ label, text, sourceId });
    expect(listingsDisagree('hours', [v('Google', 'Mon-Fri 7am-6pm', 's1'), v('Website', 'Monday–Friday 7:00 AM – 5:00 PM', 's2')])).toBeTruthy();
    expect(listingsDisagree('hours', [v('Google', 'Mon-Fri 7am-5pm', 's1'), v('Website', 'Monday–Friday 7:00 AM – 5:00 PM', 's2')])).toBeNull();
    expect(listingsDisagree('phone', [v('Google', '(415) 555-0123', 's1'), v('Yelp', '+1 415 555 0123', 's2')])).toBeNull();
  });
});

describe('review themes', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('needs 2 mentions from 2 sources', () => {
    expect(() => reviewThemeFinding('slow line', [{ sourceId: 's1', quote: 'slow' }, { sourceId: 's1', quote: 'so slow' }], 'Add a second register', now)).toThrow(/2 different sources/);
  });
  it('severity by recent count', () => {
    const m = (s: string, date: string) => ({ sourceId: s, quote: 'line was so slow', date });
    const f = reviewThemeFinding('Slow line', [m('s1', '2026-11-01'), m('s2', '2026-10-01'), m('s3', '2026-09-15'), m('s1', '2026-11-10')], 'Open a second register 7:30–9', now);
    expect(f.severity).toBe('high');
    expect(f.title).toBe('4 reviews in 3 months mention slow line');
    expect(f.impact.basis).toBe('none');
  });
});
