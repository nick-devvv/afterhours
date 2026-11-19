import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCommand } from '../lib/text/commands';
import { checkSite, classifyLink, extractHours, extractLinks, hasPrices, robotsDisallows, siteFindings } from '../lib/engine/sitecheck';

const fx = (f: string) => readFileSync(path.join(__dirname, 'fixtures/sites', f), 'utf8');

describe('text commands', () => {
  const cases: [string, unknown][] = [
    ['YES 2', { kind: 'yes', n: 2 }],
    ['yes 2', { kind: 'yes', n: 2 }],
    ['Y2', { kind: 'yes', n: 2 }],
    ['y 2', { kind: 'yes', n: 2 }],
    ['2 yes', { kind: 'yes', n: 2 }],
    ['approve #2', { kind: 'yes', n: 2 }],
    ['  yes   3 ', { kind: 'yes', n: 3 }],
    ['YES', { kind: 'yes' }],
    ['👍 1', { kind: 'yes', n: 1 }],
    ['NO 2', { kind: 'no', n: 2 }],
    ['skip 2', { kind: 'no', n: 2 }],
    ['ALL', { kind: 'all' }],
    ['yes all', { kind: 'all' }],
    ['2', { kind: 'details', n: 2 }],
    ['why 2', { kind: 'details', n: 2 }],
    ['more 2', { kind: 'details', n: 2 }],
    ['STOP', { kind: 'stop' }],
    ['start', { kind: 'start' }],
    ['/start own_abc', { kind: 'start', payload: 'own_abc' }],
    ['40 a day for cold brew', { kind: 'units', n: 40, item: 'cold brew' }],
    ['SCAN Tidepool Coffee', { kind: 'scan', query: 'Tidepool Coffee' }],
    ['why is the cold brew a problem?', { kind: 'question', text: 'why is the cold brew a problem?' }],
  ];
  for (const [input, want] of cases) it(`parses ${JSON.stringify(input)}`, () => expect(parseCommand(input)).toEqual(want));
});

describe('site checker parsers', () => {
  it('extracts and classifies links', () => {
    const links = extractLinks(fx('cafe-home.html'), 'https://fixture.test/');
    expect(links.map((l) => l.href)).toContain('https://fixture.test/menu');
    expect(links.some((l) => l.href.startsWith('mailto'))).toBe(false);
    expect(classifyLink('https://www.toasttab.com/fixture-cafe/v3', 'Order Online')).toBe('order');
    expect(classifyLink('https://fixture.test/book', 'Book a table')).toBe('booking');
    expect(classifyLink('https://fixture.test/menu', 'Menu')).toBe('menu');
    expect(classifyLink('https://fixture.test/about', 'About')).toBeNull();
  });
  it('reads hours from schema.org and text', () => {
    const h = extractHours(fx('cafe-home.html'));
    expect(h).toContain('Mo-Fr 07:00-17:00');
    expect(h.some((x) => /Saturday, Sunday 08:00-15:00/.test(x))).toBe(true);
    expect(h.some((x) => /Mon–Fri 7am–5pm/.test(x))).toBe(true);
  });
  it('detects prices', () => {
    expect(hasPrices(fx('cafe-menu.html'))).toBe(true);
    expect(hasPrices(fx('no-prices.html'))).toBe(false);
  });
  it('reads robots.txt', () => {
    expect(robotsDisallows('User-agent: *\nDisallow: /admin\n\nUser-agent: Googlebot\nDisallow: /x')).toEqual(['/admin']);
  });

  it('checks a site end to end with a fake fetch (no network)', async () => {
    const pages: Record<string, { status: number; html?: string }> = {
      'https://fixture.test/': { status: 200, html: fx('cafe-home.html') },
      'https://fixture.test/menu': { status: 200, html: fx('cafe-menu.html') },
      'https://fixture.test/about': { status: 200, html: '<html><body>About</body></html>' },
      'https://fixture.test/book': { status: 404 },
      'https://www.toasttab.com/fixture-cafe/v3': { status: 200 },
    };
    const fake = (async (url: string) => {
      const p = pages[url] ?? { status: 404 };
      return { status: p.status, url, ok: p.status < 400, headers: new Headers({ 'content-type': p.html ? 'text/html' : 'text/plain' }), text: async () => p.html ?? '' } as unknown as Response;
    }) as typeof fetch;
    const r = await checkSite('fixture.test', { fetch: fake });
    expect(r.reachable).toBe(true);
    expect(r.hasPrices).toBe(true);
    expect(r.hasViewport).toBe(true);
    const broken = r.links.filter((l) => !l.ok);
    expect(broken.map((l) => l.url)).toEqual(['https://fixture.test/book']);
    const fs = siteFindings(r, 'src_1', {});
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ kind: 'broken_link', severity: 'high' });
    expect(fs[0].title).toBe('Your booking link is broken (404)');
  });
});
