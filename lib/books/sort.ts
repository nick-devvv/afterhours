// Dot, the file clerk. The owner sends everything at once; we work out which file is which.
// Code sorts the clear cases deterministically. Only low-confidence files go to Grok, and its answer is
// checked against the file's real headers before we accept it.
import type { BooksField, BooksKind, SortedFile } from '../types';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export const MAX_ROWS = 5000;

// ---------- reading ----------

/** RFC 4180-ish: quotes, escaped quotes, newlines inside quotes. Delimiter auto-detected. */
export function parseDelimited(text: string): ParsedFile {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', '\t', ';', '|'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) records.push(row);
      row = [];
      if (records.length > MAX_ROWS) break;
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) records.push(row);
  }
  // Exports often have a title line or two above the real header: take the first row that looks like headers.
  const hi = Math.max(0, records.slice(0, 6).findIndex((r) => r.filter((c) => c.trim() && !/^[-$\d.,/: ]+$/.test(c.trim())).length >= 2));
  const headers = (records[hi] ?? []).map((h, i) => h.trim() || `column_${i + 1}`);
  const rows = records.slice(hi + 1, hi + 1 + MAX_ROWS).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

export function parseJsonRows(text: string): ParsedFile | null {
  try {
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : Object.values(j as object).find(Array.isArray);
    if (!Array.isArray(arr) || !arr.length || typeof arr[0] !== 'object') return null;
    const headers = [...new Set(arr.slice(0, 50).flatMap((r) => Object.keys(r as object)))];
    const rows = arr.slice(0, MAX_ROWS).map((r) => Object.fromEntries(headers.map((h) => [h, String((r as Record<string, unknown>)[h] ?? '')])));
    return { headers, rows };
  } catch {
    return null;
  }
}

const READABLE = /\.(csv|tsv|txt|json)$/i;
const UNREADABLE: [RegExp, string][] = [
  [/\.pdf$/i, "PDFs (receipts, statements) aren't read yet"],
  [/\.(xlsx|xls|numbers)$/i, 'Spreadsheet files: export as CSV for now'],
  [/\.(png|jpe?g|heic|gif|webp)$/i, "Photos aren't read yet"],
  [/\.zip$/i, 'Unzip and send the files inside'],
];

export function readFile(name: string, text: string | null): ParsedFile | { skip: string } {
  const un = UNREADABLE.find(([re]) => re.test(name));
  if (un) return { skip: un[1] };
  if (text == null) return { skip: "Couldn't read this file as text" };
  if (/\.json$/i.test(name)) return parseJsonRows(text) ?? { skip: "JSON, but not a list of records" };
  if (!READABLE.test(name) && /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 2000))) return { skip: 'Binary file we can\'t read yet' };
  const p = parseDelimited(text);
  if (p.headers.length < 2 || !p.rows.length) return { skip: 'No table found in this file' };
  return p;
}

// ---------- sorting ----------

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();

const SYNONYMS: Record<BooksField, string[]> = {
  date: ['date', 'posted', 'posting date', 'transaction date', 'txn date', 'paid on', 'order date', 'day', 'created', 'time'],
  payee: ['payee', 'vendor', 'vendor name', 'merchant', 'supplier', 'paid to', 'description', 'name'],
  amount: ['amount', 'total', 'debit', 'charge', 'payment', 'amount paid', 'withdrawal', 'cost'],
  reference: ['reference', 'ref', 'invoice', 'invoice #', 'invoice number', 'check #', 'check number', 'transaction id', 'memo'],
  category: ['category', 'account', 'type', 'class'],
  sku: ['sku', 'item id', 'product id', 'item code', 'code', 'upc', 'barcode'],
  item: ['item', 'item name', 'product', 'product name', 'menu item', 'name', 'description'],
  quantity: ['qty', 'quantity', 'units', 'units sold', 'items sold', 'sold', 'count'],
  unit_price: ['price', 'unit price', 'sale price', 'retail', 'retail price', 'menu price'],
  unit_cost: ['cost', 'unit cost', 'wholesale', 'cogs', 'cost per unit'],
  net_sales: ['net sales', 'gross sales', 'sales', 'revenue', 'net', 'total sales'],
};

/** The best header for each field, by exact synonym first, then containment. Each header used once. */
export function mapColumns(headers: string[], fields: BooksField[]): Partial<Record<BooksField, string>> {
  const out: Partial<Record<BooksField, string>> = {};
  const used = new Set<string>();
  for (const pass of ['exact', 'contains'] as const)
    for (const f of fields) {
      if (out[f]) continue;
      const hit = headers.find((h) => !used.has(h) && SYNONYMS[f].some((s) => (pass === 'exact' ? norm(h) === s : norm(h).split(' ').includes(s) || norm(h).includes(s))));
      if (hit) {
        out[f] = hit;
        used.add(hit);
      }
    }
  return out;
}

const looksLikeDate = (v: string) => /^\d{4}-\d{1,2}-\d{1,2}|^\d{1,2}\/\d{1,2}\/\d{2,4}|^[A-Z][a-z]{2} \d{1,2},? \d{4}/.test(v.trim());
const looksLikeMoney = (v: string) => /^\(?-?\$?\s?-?[\d,]+(\.\d{1,2})?\)?$/.test(v.trim()) && /\d/.test(v);

/** Does most of the column hold what the field says? Guards against a "Name" column mapped as amount, etc. */
function columnHolds(rows: Record<string, string>[], header: string | undefined, test: (v: string) => boolean) {
  if (!header) return false;
  const vals = rows.slice(0, 40).map((r) => r[header]).filter((v) => v && v.trim());
  return vals.length > 0 && vals.filter(test).length / vals.length >= 0.7;
}

const PROFILES: { kind: Exclude<BooksKind, 'other' | 'skipped'>; fields: BooksField[]; required: BooksField[][] }[] = [
  { kind: 'expenses', fields: ['date', 'payee', 'amount', 'reference', 'category'], required: [['date'], ['payee'], ['amount']] },
  { kind: 'sales', fields: ['date', 'item', 'sku', 'quantity', 'net_sales', 'unit_price'], required: [['date'], ['item', 'sku'], ['quantity', 'net_sales']] },
  { kind: 'catalog', fields: ['sku', 'item', 'unit_price', 'unit_cost', 'category'], required: [['item', 'sku'], ['unit_price', 'unit_cost']] },
];

export interface CodeSort {
  kind: Exclude<BooksKind, 'skipped'>;
  confidence: SortedFile['confidence'];
  columns: Partial<Record<BooksField, string>>;
  reason: string;
}

export function sortByCode(name: string, p: ParsedFile): CodeSort {
  const n = name.toLowerCase();
  const nameHint: Partial<Record<CodeSort['kind'], number>> = {
    expenses: /expens|bill|payable|vendor|purchas|bank|statement|card|ledger|transactions?/.test(n) ? 1 : 0,
    sales: /sales|orders?|revenue|pos|square|toast|clover|items? sold|transactions? report/.test(n) ? 1 : 0,
    catalog: /catalog|menu|price ?list|products?|inventory|items?\.csv/.test(n) ? 1 : 0,
  };
  const scored = PROFILES.map((pr) => {
    const columns = mapColumns(p.headers, pr.fields);
    const met = pr.required.filter((alts) => alts.some((f) => columns[f])).length;
    let score = met / pr.required.length;
    // Values must back the mapping up.
    if (columns.date && !columnHolds(p.rows, columns.date, looksLikeDate)) score -= 0.34;
    if (columns.amount && !columnHolds(p.rows, columns.amount, looksLikeMoney)) score -= 0.34;
    if (pr.kind === 'catalog' && columns.date) score -= 0.25;
    if (pr.kind === 'catalog' && !columns.date && p.headers.some((h) => SYNONYMS.date.includes(norm(h)))) score -= 0.25;
    score += (nameHint[pr.kind] ?? 0) * 0.15;
    return { pr, columns, met, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  const gap = best.score - (scored[1]?.score ?? 0);
  const full = best.met === best.pr.required.length;
  const confidence: SortedFile['confidence'] = full && best.score >= 1 && gap >= 0.3 ? 'high' : full && gap >= 0.15 ? 'medium' : 'low';
  if (best.score < 0.6) return { kind: 'other', confidence: 'low', columns: {}, reason: `Headers (${p.headers.slice(0, 5).join(', ')}) don't look like expenses, sales or a price list` };
  const shown = Object.entries(best.columns).map(([, h]) => h).slice(0, 4).join(', ');
  return { kind: best.pr.kind, confidence, columns: best.columns, reason: `Looks like ${best.pr.kind}: has ${shown}` };
}

/** Check a model's mapping against the real headers; drop anything that isn't an actual header. */
export function validateMapping(headers: string[], columns: Record<string, unknown>): Partial<Record<BooksField, string>> {
  const out: Partial<Record<BooksField, string>> = {};
  for (const [k, v] of Object.entries(columns ?? {})) if (k in SYNONYMS && typeof v === 'string' && headers.includes(v)) out[k as BooksField] = v;
  return out;
}
