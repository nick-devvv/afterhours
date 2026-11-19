// Pure parser for the owner's texts. Case-insensitive, forgiving.
export type Command =
  | { kind: 'yes'; n?: number }
  | { kind: 'no'; n?: number }
  | { kind: 'all' }
  | { kind: 'details'; n: number }
  | { kind: 'stop' }
  | { kind: 'start'; payload?: string }
  | { kind: 'units'; n: number; item?: string }
  | { kind: 'scan'; query: string }
  | { kind: 'question'; text: string };

const YES = '(?:yes|y|yep|yeah|ok|okay|approve|approved|do it|go|👍|✅)';
const NO = '(?:no|n|nope|skip|reject|decline|❌|👎)';

export function parseCommand(raw: string): Command {
  const text = raw.trim();
  const t = text.toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim();
  if (!t) return { kind: 'question', text };

  const start = t.match(/^\/start(?:\s+(\S+))?$/);
  if (start) return { kind: 'start', payload: start[1] };
  if (/^(stop|unsubscribe|cancel|end|quit|stopall)$/.test(t)) return { kind: 'stop' };
  if (/^(start|unstop|resume)$/.test(t)) return { kind: 'start' };
  if (new RegExp(`^(?:${YES} ?)?all$|^${YES} (?:to )?all$|^approve all$`).test(t)) return { kind: 'all' };

  const num = '#?(\\d{1,2})';
  let m = t.match(new RegExp(`^${YES}[ ,:-]*(?:to |fix )?${num}$`)) ?? t.match(new RegExp(`^(?:fix )?${num}[ ,:-]*${YES}$`));
  if (m) return { kind: 'yes', n: Number(m[1]) };
  m = t.match(new RegExp(`^${NO}[ ,:-]*(?:to |fix )?${num}$`)) ?? t.match(new RegExp(`^(?:fix )?${num}[ ,:-]*${NO}$`));
  if (m) return { kind: 'no', n: Number(m[1]) };
  if (new RegExp(`^${YES}$`).test(t)) return { kind: 'yes' };
  if (new RegExp(`^${NO}$`).test(t)) return { kind: 'no' };

  m = t.match(/^(?:more|why|details?|what(?:'s| is)?|explain|info|tell me about)?\s*(?:about |on )?(?:fix |number |#)?(\d{1,2})\??$/);
  if (m) return { kind: 'details', n: Number(m[1]) };

  m = t.match(/^(?:we sell |i sell |about |around |~)?(\d{1,4}) (?:a|per|\/) ?day(?: (?:for|of) (.+))?$/) ?? t.match(/^(?:we sell |i sell )(?:about |around |~)?(\d{1,4}) (.+?) (?:a|per) day$/);
  if (m) return { kind: 'units', n: Number(m[1]), ...(m[2] ? { item: m[2].trim() } : {}) };

  m = text.match(/^scan\s+(.+)$/i);
  if (m) return { kind: 'scan', query: m[1].trim() };

  return { kind: 'question', text };
}
