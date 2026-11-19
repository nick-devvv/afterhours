// Lou's checks on the owner's own exports (as Dot sorted them). Pure functions. basis: 'books'.
import type { BooksField } from '../types';
import type { NewFinding } from '../engine/prices';
import { formatCents, median } from '../engine/money';

export type Row = Record<string, string>;
export interface MappedFile {
  fileId: string;
  sourceId: string;
  name: string;
  columns: Partial<Record<BooksField, string>>;
  rows: Row[];
}

const DAY = 86_400_000;

/** "$1,234.56", "(12.00)", "-59.99" → 123456 / 1200 / 5999 (absolute cents). null if not money. */
export function moneyCents(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.replace(/[\s$,]/g, '').replace(/^\((.*)\)$/, '$1').replace(/^-/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [d, c = ''] = s.split('.');
  return Number(d) * 100 + Number(c.padEnd(2, '0'));
}

/** ISO, M/D/YY(YY), "Oct 2, 2026" → epoch ms (UTC midnight). null if unreadable. */
export function parseDate(v: string | undefined): number | null {
  if (!v) return null;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
  const p = Date.parse(t);
  return Number.isFinite(p) ? p - (p % DAY) : null;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const normPayee = (s: string) =>
  s.toLowerCase().replace(/[*#]\s*\w*\d\w*/g, ' ').replace(/[^a-z ]+/g, ' ').replace(/\b(inc|llc|co|corp|ltd)\b/g, '').replace(/\s+/g, ' ').trim();

interface Expense {
  payee: string;
  key: string;
  cents: number;
  date: number | null;
  ref: string;
  sourceId: string;
}

export function expensesOf(files: MappedFile[]): Expense[] {
  const out: Expense[] = [];
  for (const f of files) {
    const c = f.columns;
    if (!c.payee || !c.amount) continue;
    for (const r of f.rows) {
      const cents = moneyCents(r[c.amount]);
      const payee = (r[c.payee] ?? '').trim();
      if (!cents || !payee) continue;
      out.push({ payee, key: normPayee(payee), cents, date: parseDate(c.date ? r[c.date] : undefined), ref: (c.reference ? r[c.reference] : '')?.trim() ?? '', sourceId: f.sourceId });
    }
  }
  return out;
}

const none = { oneTimeCents: 0, monthlyCents: 0, firstYearCents: 0 };

/** Same payee, same amount to the cent, and the same reference or within 7 days. */
export function duplicatePayments(files: MappedFile[]): NewFinding[] {
  const ex = expensesOf(files);
  const out: NewFinding[] = [];
  const used = new Set<number>();
  for (let i = 0; i < ex.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < ex.length; j++) {
      if (used.has(j)) continue;
      const a = ex[i];
      const b = ex[j];
      if (a.key !== b.key || a.cents !== b.cents) continue;
      const sameRef = !!a.ref && a.ref === b.ref;
      const close = a.date != null && b.date != null && Math.abs(a.date - b.date) <= 7 * DAY;
      if (!sameRef && !close) continue;
      used.add(j);
      const when = [a.date, b.date].filter((d): d is number => d != null).map(iso);
      out.push({
        kind: 'duplicate_payment',
        agent: 'lou',
        room: 'back_office',
        title: `Paid ${a.payee} ${formatCents(a.cents)} twice`,
        detail: `Two payments of ${formatCents(a.cents)} to ${a.payee}${when.length ? ` (${when.join(' and ')})` : ''}${sameRef ? ` with the same reference ${a.ref}` : ''}. From your own export: ask them to refund one.`,
        severity: a.cents >= 10_000 ? 'high' : a.cents >= 2_000 ? 'medium' : 'low',
        impact: { basis: 'books', ...none, oneTimeCents: a.cents, firstYearCents: a.cents, assumptions: ['From your own export. Check it isn’t two separate orders before asking for a refund.'] },
        facts: { payee: a.payee, amount: formatCents(a.cents), dates: when.join(', ') },
        sourceIds: [...new Set([a.sourceId, b.sourceId])],
        fix: { type: 'refund_request' },
      });
      break;
    }
  }
  return out;
}

const monthKey = (ms: number) => iso(ms).slice(0, 7);

/** Monthly in ≥ 4 of the last 6 months; latest ≥ 1.10 × the median of the first 3 and ≥ $5 more. */
export function subscriptionCreep(files: MappedFile[]): NewFinding[] {
  const byPayee = new Map<string, Expense[]>();
  for (const e of expensesOf(files)) if (e.date != null) byPayee.set(e.key, [...(byPayee.get(e.key) ?? []), e]);
  const out: NewFinding[] = [];
  for (const list of byPayee.values()) {
    const months = new Map<string, Expense>();
    for (const e of list.sort((a, b) => a.date! - b.date!)) months.set(monthKey(e.date!), e); // last charge per month
    const series = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, e]) => e);
    if (series.length < 4) continue;
    const base = median(series.slice(0, 3).map((e) => e.cents));
    const latest = series[series.length - 1];
    const delta = latest.cents - base;
    if (!(latest.cents >= base * 1.1 && delta >= 500)) continue;
    out.push({
      kind: 'subscription_creep',
      agent: 'lou',
      room: 'back_office',
      title: `${latest.payee} went from ${formatCents(base)} to ${formatCents(latest.cents)} a month`,
      detail: `${latest.payee} charged you every month for ${series.length} months. It was ${formatCents(base)} and is now ${formatCents(latest.cents)}. From your own export: check the plan, or downgrade.`,
      severity: delta * 12 >= 30_000 ? 'high' : delta * 12 >= 10_000 ? 'medium' : 'low',
      impact: { basis: 'books', oneTimeCents: 0, monthlyCents: delta, firstYearCents: delta * 12, assumptions: ['Compares the latest monthly charge with the median of the first three months in your export.'] },
      facts: { payee: latest.payee, was: formatCents(base), now: formatCents(latest.cents), increase: formatCents(delta), yearly: formatCents(delta * 12) },
      sourceIds: [latest.sourceId],
      fix: { type: 'plan_downgrade' },
    });
  }
  return out;
}

/** Catalog with cost history (dated rows per item): unit cost up ≥ 10% and margin down ≥ 5 points. */
export function marginErosion(files: MappedFile[]): NewFinding[] {
  const byItem = new Map<string, { item: string; date: number; cost: number; price: number; sourceId: string }[]>();
  for (const f of files) {
    const c = f.columns;
    const name = c.item ?? c.sku;
    if (!name || !c.unit_cost || !c.unit_price || !c.date) continue;
    for (const r of f.rows) {
      const cost = moneyCents(r[c.unit_cost]);
      const price = moneyCents(r[c.unit_price]);
      const date = parseDate(r[c.date]);
      if (!cost || !price || date == null) continue;
      const item = r[name].trim();
      byItem.set(item.toLowerCase(), [...(byItem.get(item.toLowerCase()) ?? []), { item, date, cost, price, sourceId: f.sourceId }]);
    }
  }
  const out: NewFinding[] = [];
  for (const rows of byItem.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => a.date - b.date);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const m0 = (first.price - first.cost) / first.price;
    const m1 = (last.price - last.cost) / last.price;
    if (!(last.cost >= first.cost * 1.1 && m0 - m1 >= 0.05)) continue;
    const pts = Math.round((m0 - m1) * 100);
    out.push({
      kind: 'margin_erosion',
      agent: 'lou',
      room: 'back_office',
      title: `${last.item}: cost up ${formatCents(last.cost - first.cost)}, margin down ${pts} points`,
      detail: `${last.item} cost you ${formatCents(first.cost)} on ${iso(first.date)} and ${formatCents(last.cost)} on ${iso(last.date)}, while you charge ${formatCents(last.price)}. Margin went from ${Math.round(m0 * 100)}% to ${Math.round(m1 * 100)}%.`,
      severity: pts >= 10 ? 'high' : 'medium',
      impact: { basis: 'none', ...none, assumptions: ['No dollar figure without units sold; upload sales to size it.'] },
      facts: { item: last.item, costWas: formatCents(first.cost), costNow: formatCents(last.cost), price: formatCents(last.price), marginWas: `${Math.round(m0 * 100)}%`, marginNow: `${Math.round(m1 * 100)}%` },
      sourceIds: [last.sourceId],
      fix: { type: 'price_change' },
    });
  }
  return out;
}
