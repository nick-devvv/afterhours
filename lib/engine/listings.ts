// Normalize hours / phone / address and decide whether listings really disagree. Pure.
import type { NewFinding } from './prices';

export type ListingField = 'hours' | 'phone' | 'address';
export interface ListingValue {
  label: string;
  text: string;
  sourceId: string;
}

export function normalizePhone(s: string): string {
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d ? `+${d}` : '';
}

const ABBR: [RegExp, string][] = [
  [/\bstreet\b/g, 'st'], [/\bavenue\b/g, 'ave'], [/\broad\b/g, 'rd'], [/\bboulevard\b/g, 'blvd'],
  [/\bdrive\b/g, 'dr'], [/\blane\b/g, 'ln'], [/\bsuite\b/g, 'ste'], [/\bplace\b/g, 'pl'], [/\bcourt\b/g, 'ct'],
  [/\bnorth\b/g, 'n'], [/\bsouth\b/g, 's'], [/\beast\b/g, 'e'], [/\bwest\b/g, 'w'], [/#/g, ' ste '],
  [/\bunited states\b|\busa\b/g, ''],
];

export function normalizeAddress(s: string): string {
  let a = s.toLowerCase();
  for (const [re, to] of ABBR) a = a.replace(re, to);
  a = a.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  // Compare street line + number only: listings often differ in "CA 94110" vs "California".
  return a.split(' ').slice(0, 4).join(' ');
}

// ---------- hours ----------

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_RE = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?/g;

function dayIndex(tok: string) {
  return DAYS.indexOf(tok.slice(0, 3) as (typeof DAYS)[number]);
}

/** "7am", "7:30 pm", "17:00", "noon" → minutes after midnight */
export function parseTime(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\./g, '');
  if (t === 'noon') return 12 * 60;
  if (t === 'midnight') return 24 * 60;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Parse free-text hours into day → "HH:MM-HH:MM" | "closed". null if it can't be read with confidence. */
export function parseHours(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  const segs = text.toLowerCase().replace(/[–—]/g, '-').replace(/\bto\b/g, '-').split(/[;,\n|]+/);
  for (const raw of segs) {
    const seg = raw.trim();
    if (!seg) continue;
    let days: number[] = [];
    if (/\b(daily|every ?day|7 days)\b/.test(seg)) days = [0, 1, 2, 3, 4, 5, 6];
    else {
      const toks = [...seg.matchAll(DAY_RE)].map((m) => m[1]);
      const range = seg.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*-\s*(mon|tue|wed|thu|fri|sat|sun)/);
      if (range) {
        const a = dayIndex(range[1]);
        const b = dayIndex(range[2]);
        for (let i = a; ; i = (i + 1) % 7) {
          days.push(i);
          if (i === b) break;
        }
        // also individual days listed outside the range
        for (const t of toks) if (!days.includes(dayIndex(t))) days.push(dayIndex(t));
      } else days = toks.map(dayIndex);
    }
    if (!days.length) return null;
    let val: string;
    if (/closed/.test(seg)) val = 'closed';
    else if (/24 ?hours|open 24/.test(seg)) val = '00:00-24:00';
    else {
      const timePart = seg.replace(DAY_RE, ' ').replace(/^[\s:-]+/, '');
      const tm = timePart.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?|noon|midnight)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?|noon|midnight)/);
      if (!tm) return null;
      let a = parseTime(tm[1]);
      let b = parseTime(tm[2]);
      if (a == null || b == null) return null;
      // "7-5" with no am/pm: read the close as pm
      if (!/[ap]/.test(tm[2]) && b <= a && b < 12 * 60) b += 12 * 60;
      if (!/[ap]/.test(tm[1]) && /p/.test(tm[2]) && a > b) a -= 12 * 60;
      const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
      val = `${fmt(a)}-${fmt(b)}`;
    }
    for (const d of days) out[DAYS[d]] = val;
  }
  return Object.keys(out).length ? out : null;
}

function normalize(field: ListingField, text: string): string {
  if (field === 'phone') return normalizePhone(text);
  if (field === 'address') return normalizeAddress(text);
  const h = parseHours(text);
  return h ? JSON.stringify(h) : text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** For hours: only compare days both sources state. */
function hoursDiffer(a: string, b: string): boolean {
  const ha = parseHours(a);
  const hb = parseHours(b);
  if (!ha || !hb) return normalize('hours', a) !== normalize('hours', b);
  const shared = Object.keys(ha).filter((d) => d in hb);
  if (!shared.length) return false;
  return shared.some((d) => ha[d] !== hb[d]);
}

export function listingsDisagree(field: ListingField, values: ListingValue[]): [ListingValue, ListingValue] | null {
  for (let i = 0; i < values.length; i++)
    for (let j = i + 1; j < values.length; j++) {
      const a = values[i];
      const b = values[j];
      if (a.sourceId === b.sourceId) continue;
      const differ = field === 'hours' ? hoursDiffer(a.text, b.text) : normalize(field, a.text) !== normalize(field, b.text);
      if (differ) return [a, b];
    }
  return null;
}

export function listingFinding(field: ListingField, pair: [ListingValue, ListingValue]): NewFinding {
  const [a, b] = pair;
  const what = field === 'hours' ? 'hours' : field === 'phone' ? 'phone number' : 'address';
  return {
    kind: 'listing_mismatch',
    agent: 'otto',
    room: 'server_closet',
    title: `Your ${what} ${field === 'hours' ? 'disagree' : 'disagrees'}: ${a.label} vs ${b.label}`,
    detail: `${a.label} says "${a.text}", ${b.label} says "${b.text}". Customers who trust the wrong one ${field === 'hours' ? 'show up to a closed door or skip you when you\'re open' : 'can\'t reach you'}.`,
    severity: field === 'hours' ? 'high' : 'medium',
    impact: { basis: 'none', oneTimeCents: 0, monthlyCents: 0, firstYearCents: 0, assumptions: ['We don\'t put a dollar figure on listing mismatches.'] },
    facts: { field, [a.label]: a.text, [b.label]: b.text },
    sourceIds: [a.sourceId, b.sourceId],
    fix: { type: 'listing_update' },
  };
}
