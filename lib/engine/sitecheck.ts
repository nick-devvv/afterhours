// Our own site checker. Deterministic: the model never decides whether a link is broken.
import type { NewFinding } from './prices';

export type LinkKind = 'order' | 'menu' | 'booking';
export interface LinkCheck {
  url: string;
  kind: LinkKind;
  text: string;
  status: number | null;
  ok: boolean;
  error?: string;
}
export interface SiteReport {
  url: string;
  reachable: boolean;
  homepageStatus: number | null;
  pagesChecked: number;
  pages: { url: string; status: number | null }[];
  links: LinkCheck[];
  hours: string[];
  hasPrices: boolean;
  hasViewport: boolean;
  loadMs: number | null;
  robotsBlocked: string[];
}

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 AfterhoursSiteCheck/1.0';

const ORDER_HOSTS = ['toasttab.com', 'squareup.com', 'square.site', 'chownow.com', 'doordash.com', 'ubereats.com', 'grubhub.com', 'postmates.com', 'clover.com', 'order.online', 'olo.com', 'slicelife.com', 'menufy.com'];
const BOOKING_HOSTS = ['opentable.com', 'resy.com', 'exploretock.com', 'tock.com', 'yelp.com/reservations', 'vagaro.com', 'booksy.com', 'styleseat.com', 'fresha.com', 'calendly.com', 'acuityscheduling.com', 'mindbodyonline.com', 'schedulicity.com', 'glossgenius.com'];

export function classifyLink(href: string, text = ''): LinkKind | null {
  const h = href.toLowerCase();
  const t = text.toLowerCase();
  if (BOOKING_HOSTS.some((d) => h.includes(d)) || /\/(book|booking|reserve|reservations?|appointments?|schedule)\b/.test(h) || /\b(book now|reserve|reservation|book an appointment)\b/.test(t)) return 'booking';
  if (ORDER_HOSTS.some((d) => h.includes(d)) || /\/(order|order-online|online-ordering|shop|checkout)\b/.test(h) || /\b(order online|order now|order pickup|delivery|order ahead)\b/.test(t)) return 'order';
  if (/\/(menus?|our-menu|food|drinks)\b/.test(h) || /\bmenus?\b/.test(t)) return 'menu';
  return null;
}

export function extractLinks(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'), base);
      if (!/^https?:$/.test(u.protocol)) continue;
      u.hash = '';
      out.push({ href: u.toString(), text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) });
    } catch {
      /* skip bad hrefs */
    }
  }
  return out;
}

export const hasViewport = (html: string) => /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html);

export function textOf(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

export const hasPrices = (html: string) => /\$\s?\d{1,3}(?:\.\d{2})\b/.test(textOf(html));

export function extractHours(html: string): string[] {
  const found = new Set<string>();
  // schema.org JSON-LD openingHours / openingHoursSpecification
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o: unknown): void => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        const r = o as Record<string, unknown>;
        if (typeof r.openingHours === 'string') found.add(r.openingHours);
        if (Array.isArray(r.openingHours)) r.openingHours.forEach((h) => typeof h === 'string' && found.add(h));
        if (Array.isArray(r.openingHoursSpecification))
          for (const s of r.openingHoursSpecification as Record<string, unknown>[]) {
            const days = ([] as unknown[]).concat(s.dayOfWeek ?? []).map((d) => String(d).split('/').pop()).join(', ');
            if (s.opens && s.closes) found.add(`${days} ${s.opens}-${s.closes}`);
          }
        Object.values(r).forEach(walk);
      };
      walk(JSON.parse(m[1]));
    } catch {
      /* bad JSON-LD */
    }
  }
  for (const m of html.matchAll(/itemprop=["']openingHours["'][^>]*content=["']([^"']+)["']/gi)) found.add(m[1]);
  // Plain text like "Mon–Fri 7am–5pm"
  const text = textOf(html);
  const re = /\b(?:mon|tue|wed|thu|fri|sat|sun|daily|every ?day)[a-z]*\.?(?:\s*[-–—&,]\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?)*:?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/gi;
  for (const m of text.matchAll(re)) found.add(m[0].trim());
  return [...found].slice(0, 12);
}

export function robotsDisallows(robots: string): string[] {
  const out: string[] = [];
  let applies = false;
  for (const line of robots.split(/\r?\n/)) {
    const [k, ...rest] = line.split(':');
    const v = rest.join(':').trim();
    if (/^user-agent$/i.test(k.trim())) applies = v === '*';
    else if (applies && /^disallow$/i.test(k.trim()) && v) out.push(v);
  }
  return out;
}

type Fetcher = typeof fetch;

async function get(f: Fetcher, url: string, timeoutMs: number, method = 'GET') {
  const started = Date.now();
  try {
    const res = await f(url, { method, redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: AbortSignal.timeout(timeoutMs) });
    const ct = res.headers.get('content-type') ?? '';
    const html = method === 'GET' && ct.includes('html') ? (await res.text()).slice(0, 600_000) : '';
    return { status: res.status, html, ms: Date.now() - started, finalUrl: res.url || url };
  } catch (e) {
    const err = e as Error;
    return { status: null as number | null, html: '', ms: Date.now() - started, finalUrl: url, error: err.name === 'TimeoutError' ? 'timeout' : (err.cause as Error)?.message || err.message };
  }
}

export async function checkSite(startUrl: string, opts: { fetch?: Fetcher; maxPages?: number; timeoutMs?: number } = {}): Promise<SiteReport> {
  const f = opts.fetch ?? fetch;
  const maxPages = opts.maxPages ?? 15;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const start = new URL(/^https?:\/\//.test(startUrl) ? startUrl : `https://${startUrl}`);
  const host = start.host.replace(/^www\./, '');
  const report: SiteReport = { url: start.toString(), reachable: false, homepageStatus: null, pagesChecked: 0, pages: [], links: [], hours: [], hasPrices: false, hasViewport: false, loadMs: null, robotsBlocked: [] };

  const robots = await get(f, `${start.origin}/robots.txt`, timeoutMs);
  const disallow = robots.status === 200 ? robotsDisallows(robots.html || '') : [];
  const allowed = (u: URL) => !disallow.some((p) => p !== '/' && u.pathname.startsWith(p));

  const queue = [start.toString()];
  const seen = new Set(queue);
  const linkSeen = new Map<string, { kind: LinkKind; text: string }>();
  const hours = new Set<string>();

  while (queue.length && report.pagesChecked < maxPages) {
    const url = queue.shift()!;
    const u = new URL(url);
    if (!allowed(u) && url !== start.toString()) {
      report.robotsBlocked.push(url);
      continue;
    }
    const r = await get(f, url, timeoutMs);
    report.pagesChecked++;
    report.pages.push({ url, status: r.status });
    if (url === start.toString()) {
      report.homepageStatus = r.status;
      report.reachable = r.status != null && r.status < 400;
      report.loadMs = r.ms;
      report.hasViewport = hasViewport(r.html);
      if (!report.reachable) break;
    }
    if (!r.html) continue;
    if (hasPrices(r.html)) report.hasPrices = true;
    extractHours(r.html).forEach((h) => hours.add(h));
    for (const l of extractLinks(r.html, r.finalUrl)) {
      const lu = new URL(l.href);
      const kind = classifyLink(l.href, l.text);
      if (kind && !linkSeen.has(l.href)) linkSeen.set(l.href, { kind, text: l.text });
      if (lu.host.replace(/^www\./, '') === host && !seen.has(l.href) && !/\.(pdf|jpe?g|png|gif|webp|svg|mp4|zip)$/i.test(lu.pathname)) {
        seen.add(l.href);
        // menu/order pages first: they're the ones that matter
        if (kind) queue.unshift(l.href);
        else queue.push(l.href);
      }
    }
  }

  const toCheck = [...linkSeen.entries()].slice(0, 20);
  report.links = await Promise.all(
    toCheck.map(async ([url, { kind, text }]) => {
      const already = report.pages.find((p) => p.url === url);
      const r = already ? { status: already.status, error: undefined } : await get(f, url, timeoutMs);
      // Some ordering platforms block bots with 403/429; that isn't proof the link is broken.
      const ok = r.status != null && (r.status < 400 || r.status === 403 || r.status === 429);
      return { url, kind, text, status: r.status, ok, ...(r.error ? { error: r.error } : {}) };
    }),
  );
  report.hours = [...hours];
  return report;
}

/** Findings the site check creates by itself. siteSourceId is the site_check source for the homepage. */
export function siteFindings(report: SiteReport, siteSourceId: string, linkSourceIds: Record<string, string>): NewFinding[] {
  const out: NewFinding[] = [];
  const none = { basis: 'none' as const, oneTimeCents: 0, monthlyCents: 0, firstYearCents: 0 };
  if (!report.reachable) {
    out.push({
      kind: 'missing_online', agent: 'otto', room: 'server_closet',
      title: `Your website doesn't load (${report.homepageStatus ?? 'no response'})`,
      detail: `Our checker couldn't load ${report.url}${report.homepageStatus ? ` (HTTP ${report.homepageStatus})` : ''}. Customers looking for your menu or hours hit a dead end.`,
      severity: 'high', impact: { ...none, assumptions: ['Checked once by our server; it could be a temporary outage.'] },
      facts: { url: report.url, status: String(report.homepageStatus ?? 'no response') }, sourceIds: [siteSourceId], fix: { type: 'site_fix' },
    });
    return out;
  }
  for (const l of report.links.filter((x) => !x.ok)) {
    const what = l.kind === 'order' ? 'online-order' : l.kind === 'booking' ? 'booking' : 'menu';
    out.push({
      kind: 'broken_link', agent: 'otto', room: 'server_closet',
      title: `Your ${what} link is broken (${l.status ?? l.error ?? 'no response'})`,
      detail: `The "${l.text || what}" link on your site goes to ${l.url}, which returned ${l.status ? `HTTP ${l.status}` : l.error ?? 'nothing'} when our checker tried it.`,
      severity: l.kind === 'menu' ? 'medium' : 'high', impact: { ...none, assumptions: ['Checked by our server during this shift.'] },
      facts: { url: l.url, status: String(l.status ?? l.error ?? 'no response'), linkText: l.text },
      sourceIds: [linkSourceIds[l.url] ?? siteSourceId], fix: { type: 'site_fix' },
    });
  }
  if (!report.hasPrices) {
    out.push({
      kind: 'missing_online', agent: 'otto', room: 'server_closet',
      title: 'Your website shows no prices',
      detail: `Our checker read ${report.pagesChecked} page${report.pagesChecked === 1 ? '' : 's'} on your site and found no menu prices. People comparing shops on their phone skip the one without prices.`,
      severity: 'medium', impact: { ...none, assumptions: [`Based on the ${report.pagesChecked} pages our checker could read; prices inside images or PDFs aren't counted.`] },
      facts: { url: report.url, pagesChecked: String(report.pagesChecked) }, sourceIds: [siteSourceId], fix: { type: 'site_fix' },
    });
  }
  return out;
}

export function noWebsiteFinding(sourceIds: string[]): NewFinding {
  return {
    kind: 'missing_online', agent: 'otto', room: 'server_closet',
    title: "No website: customers can't find your menu or hours",
    detail: 'We could not find a website for this business, only third-party listings. Customers searching for your menu or hours land on someone else\'s page.',
    severity: 'high', impact: { basis: 'none', oneTimeCents: 0, monthlyCents: 0, firstYearCents: 0, assumptions: ['Based on the listings we found during this shift.'] },
    facts: {}, sourceIds, fix: { type: 'site_fix' },
  };
}
