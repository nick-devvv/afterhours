import { beforeEach, describe, expect, it } from 'vitest';
import { duplicatePayments, marginErosion, moneyCents, parseDate, subscriptionCreep, type MappedFile } from '../lib/books/checks';
import { resetKV } from '../lib/store/kv';
import { createRun } from '../lib/runs';
import { sortUpload } from '../lib/books/dot';
import { toolByName } from '../lib/tools';
import { callTool } from '../lib/tools/define';
import { mustGetRun } from '../lib/store';

// Fixtures only (tests/ is the one place they live).
const f = (columns: MappedFile['columns'], rows: Record<string, string>[]): MappedFile[] => [{ fileId: 'file_1', sourceId: 'src_1', name: 'x.csv', columns, rows }];
const exp = { date: 'Date', payee: 'Vendor', amount: 'Amount', reference: 'Ref' };

describe('Lou: parsing', () => {
  it('reads money and dates', () => {
    expect(moneyCents('$1,234.56')).toBe(123456);
    expect(moneyCents('(12.00)')).toBe(1200);
    expect(moneyCents('-59.99')).toBe(5999);
    expect(moneyCents('abc')).toBeNull();
    expect(parseDate('10/02/2026')).toBe(Date.UTC(2026, 9, 2));
    expect(parseDate('2026-10-02')).toBe(Date.UTC(2026, 9, 2));
  });
});

describe('Lou: duplicate payments', () => {
  it('flags same payee + amount within 7 days, or same reference', () => {
    const out = duplicatePayments(f(exp, [
      { Date: '2026-10-02', Vendor: 'SYSCO FOODS, INC', Amount: '-412.18', Ref: '' },
      { Date: '2026-10-05', Vendor: 'Sysco Foods Inc', Amount: '412.18', Ref: '' },
      { Date: '2026-09-01', Vendor: 'PG&E', Amount: '300.00', Ref: 'INV-7' },
      { Date: '2026-10-20', Vendor: 'PG&E', Amount: '300.00', Ref: 'INV-7' },
    ]));
    expect(out.map((x) => x.title)).toEqual(['Paid SYSCO FOODS, INC $412.18 twice', 'Paid PG&E $300.00 twice']);
    expect(out[0].impact).toMatchObject({ basis: 'books', oneTimeCents: 41218 });
  });
  it('must not flag a monthly bill (same amount, a month apart, no shared reference)', () => {
    expect(duplicatePayments(f(exp, [
      { Date: '2026-09-01', Vendor: 'Rent LLC', Amount: '3000.00', Ref: '' },
      { Date: '2026-10-01', Vendor: 'Rent LLC', Amount: '3000.00', Ref: '' },
    ]))).toHaveLength(0);
  });
});

describe('Lou: subscription creep', () => {
  const months = (amts: string[]) => amts.map((a, i) => ({ Date: `2026-0${i + 3}-09`, Vendor: 'ADOBE *CREATIVE CLD', Amount: a, Ref: '' }));
  it('flags ≥10% and ≥$5 over the first-three-month median', () => {
    const [x] = subscriptionCreep(f(exp, months(['54.99', '54.99', '54.99', '54.99', '59.99', '69.99'])));
    expect(x.facts).toMatchObject({ was: '$54.99', now: '$69.99', increase: '$15.00' });
    expect(x.impact).toMatchObject({ basis: 'books', monthlyCents: 1500, firstYearCents: 18000 });
  });
  it('must not flag a small bump or too few months', () => {
    expect(subscriptionCreep(f(exp, months(['54.99', '54.99', '54.99', '57.99'])))).toHaveLength(0);
    expect(subscriptionCreep(f(exp, months(['10.00', '10.00', '30.00'])))).toHaveLength(0);
  });
});

describe('Lou: margin erosion', () => {
  it('flags cost up ≥10% and margin down ≥5 points', () => {
    const [x] = marginErosion(f({ date: 'Date', item: 'Item', unit_cost: 'Cost', unit_price: 'Price' }, [
      { Date: '2026-06-01', Item: 'Cold Brew', Cost: '0.92', Price: '4.50' },
      { Date: '2026-10-01', Item: 'Cold Brew', Cost: '1.40', Price: '4.50' },
    ]));
    expect(x.title).toBe('Cold Brew: cost up $0.48, margin down 11 points');
  });
});

describe('Lou end to end: Dot sorts, scan_books finds', () => {
  beforeEach(() => resetKV());
  it('finds a duplicate in an uploaded bank export', async () => {
    const run = await createRun({ crew: 'api', candidate: { name: 'Test Cafe', sourceUrl: 'https://example.test', confidence: 'high' } });
    const bank = 'Posting Date,Description,Amount\n10/02/2026,"SYSCO FOODS, INC",-412.18\n10/04/2026,"SYSCO FOODS, INC",-412.18\n';
    await sortUpload(run.id, [{ name: 'download.csv', bytes: bank.length, text: bank }]);
    const r = (await callTool(toolByName('scan_books')!, { runId: run.id, agent: 'lou', check: 'duplicates' })) as { findings: { title: string }[] };
    expect(r.findings.map((x) => x.title)).toEqual(['Paid SYSCO FOODS, INC $412.18 twice']);
    const after = await mustGetRun(run.id);
    expect(after.totals.oneTimeCents).toBe(41218);
    expect(after.findings[0].sourceIds[0]).toBe(after.books![0].sourceId);
  });
});
