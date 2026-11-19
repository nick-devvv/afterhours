// The bad_draft check: every $ figure in a draft must be a figure the engine computed.
import { parseCents } from './money';

const DOLLAR = /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\$\s?\d+(?:\.\d{1,2})?/g;

export function dollarFigures(text: string): { raw: string; cents: number }[] {
  return (text.match(DOLLAR) ?? []).map((raw) => ({ raw, cents: parseCents(raw.replace('$', ''))! }));
}

export function allowedCents(...factSets: Record<string, string>[]): Set<number> {
  const s = new Set<number>();
  for (const facts of factSets) for (const v of Object.values(facts)) for (const f of dollarFigures(v)) s.add(f.cents);
  return s;
}

/** Returns the figures that aren't allowed (empty means OK). */
export function badFigures(texts: (string | undefined)[], allowed: Set<number>): string[] {
  const bad: string[] = [];
  for (const t of texts) if (t) for (const f of dollarFigures(t)) if (!allowed.has(f.cents)) bad.push(f.raw);
  return bad;
}
