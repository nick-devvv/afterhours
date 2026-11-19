import type { NewFinding } from './prices';

export interface Mention {
  sourceId: string;
  quote: string;
  date?: string;
  stars?: number;
}

const DAY = 86_400_000;

/** Throws a message string when the mentions don't qualify. */
export function reviewThemeFinding(theme: string, mentions: Mention[], suggestion: string, now = new Date()): NewFinding {
  const ms = mentions.map((m) => ({ ...m, quote: m.quote.trim().slice(0, 200) })).filter((m) => m.quote);
  const distinct = new Set(ms.map((m) => m.sourceId));
  if (ms.length < 2 || distinct.size < 2) throw new Error('A theme needs at least 2 mentions from at least 2 different sources');
  const recent = ms.filter((m) => {
    const t = m.date ? Date.parse(m.date) : NaN;
    return Number.isFinite(t) && now.getTime() - t <= 90 * DAY && t <= now.getTime() + DAY;
  });
  const severity = recent.length >= 4 ? 'high' : recent.length >= 2 ? 'medium' : 'low';
  const allRecent = recent.length === ms.length;
  const t = theme.trim().toLowerCase();
  return {
    kind: 'review_theme',
    agent: 'june',
    room: 'shop_floor',
    title: `${ms.length} reviews${allRecent ? ' in 3 months' : ''} mention ${t}`,
    detail: `Customers keep bringing up ${t}. ${suggestion.trim()}`,
    severity,
    impact: { basis: 'none', oneTimeCents: 0, monthlyCents: 0, firstYearCents: 0, assumptions: ['We don\'t put a dollar figure on review themes.'] },
    facts: { theme: t, count: String(ms.length), latestQuote: [...ms].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0].quote, suggestion: suggestion.trim() },
    sourceIds: [...distinct],
    fix: { type: 'review_reply' },
  };
}
