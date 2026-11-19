import type { Cents } from '../types';

/** "$4.50", "4.5", "1,234.56", 4.5 → cents. null when it isn't a price. */
export function parseCents(v: string | number): Cents | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  const m = v.replace(/[\s$,]/g, '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

/** 450 → "$4.50", 123456 → "$1,234.56" */
export function formatCents(c: Cents): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(Math.round(c));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

export const floorToQuarter = (c: Cents): Cents => Math.floor(c / 25) * 25;

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
