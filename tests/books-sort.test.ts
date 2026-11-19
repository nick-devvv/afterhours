import { beforeEach, describe, expect, it } from 'vitest';
import { parseDelimited, readFile, sortByCode } from '../lib/books/sort';
import { sortUpload } from '../lib/books/dot';
import { createRun } from '../lib/runs';
import { readEvents } from '../lib/store';
import { resetKV } from '../lib/store/kv';

// Test fixtures only (tests/ is the one place fixtures live). Names are deliberately unhelpful.
const bank = `Chase Business Checking - Activity
Posting Date,Description,Amount,Type,Check or Slip #
10/02/2026,"SYSCO FOODS, INC",-412.18,DEBIT,
10/09/2026,ADOBE *CREATIVE CLD,-59.99,DEBIT,
10/09/2026,ADOBE *CREATIVE CLD,-59.99,DEBIT,
`;
const pos = `Date\tItem\tQty\tNet Sales
2026-10-01\tCold Brew 16oz\t31\t139.50
2026-10-01\tLatte\t44\t209.00
`;
const priceList = `SKU;Product Name;Retail Price;Unit Cost
CB16;Cold Brew 16oz;4.50;0.92
LAT;Latte;4.75;1.10
`;
const notes = `Shift,Who,Notes
Mon AM,Ana,Out of oat milk
Tue PM,Sam,Grinder jammed
`;

describe('Dot sorts files by content, not by name', () => {
  it('parses quoted CSV with a title line above the headers', () => {
    const p = parseDelimited(bank);
    expect(p.headers).toEqual(['Posting Date', 'Description', 'Amount', 'Type', 'Check or Slip #']);
    expect(p.rows).toHaveLength(3);
    expect(p.rows[0].Description).toBe('SYSCO FOODS, INC');
  });
  it('bank export → expenses', () => {
    const s = sortByCode('download (3).csv', parseDelimited(bank));
    expect(s.kind).toBe('expenses');
    expect(s.columns).toMatchObject({ date: 'Posting Date', payee: 'Description', amount: 'Amount' });
    expect(s.confidence).not.toBe('low');
  });
  it('POS export (tabs) → sales', () => {
    const s = sortByCode('export.txt', parseDelimited(pos));
    expect(s.kind).toBe('sales');
    expect(s.columns).toMatchObject({ date: 'Date', item: 'Item', quantity: 'Qty', net_sales: 'Net Sales' });
  });
  it('price list (semicolons) → catalog', () => {
    const s = sortByCode('stuff.csv', parseDelimited(priceList));
    expect(s.kind).toBe('catalog');
    expect(s.columns).toMatchObject({ sku: 'SKU', item: 'Product Name', unit_price: 'Retail Price', unit_cost: 'Unit Cost' });
  });
  it('anything else → other', () => {
    expect(sortByCode('notes.csv', parseDelimited(notes)).kind).toBe('other');
  });
  it('skips formats it cannot read, and says why', () => {
    expect(readFile('receipt.pdf', 'x')).toEqual({ skip: "PDFs (receipts, statements) aren't read yet" });
    expect((readFile('books.xlsx', 'x') as { skip: string }).skip).toMatch(/CSV/);
  });
});

describe('sortUpload (no key: code only)', () => {
  beforeEach(() => {
    resetKV();
    process.env.XAI_API_KEY = '';
  });
  it('sorts a pile of files, registers sources and emits events', async () => {
    const run = await createRun({ crew: 'api', candidate: { name: 'Test Cafe', sourceUrl: 'https://example.test', confidence: 'high' } });
    const files = await sortUpload(run.id, [
      { name: 'download (3).csv', bytes: bank.length, text: bank },
      { name: 'export.txt', bytes: pos.length, text: pos },
      { name: 'stuff.csv', bytes: priceList.length, text: priceList },
      { name: 'IMG_2231.HEIC', bytes: 100, text: null },
    ]);
    expect(files.map((f) => f.kind)).toEqual(['expenses', 'sales', 'catalog', 'skipped']);
    expect(files[0].sourceId).toBeTruthy();
    const { events } = await readEvents(run.id);
    expect(events.filter((e) => e.type === 'file.sorted')).toHaveLength(4);
    expect(events.some((e) => e.type === 'agent.clocked_out' && e.agent === 'dot')).toBe(true);
  });
});
