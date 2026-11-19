// THE tool registry. REST (/api/agent/<tool>), MCP (/api/mcp) and the API crew all use these defs.
import { z } from 'zod';
import type { Business, Competitor, Fix, Source } from '../types';
import { ApiErr } from '../http';
import { newId, nowIso } from '../ids';
import { mustGetRun, mutate, indexFix } from '../store';
import { addFinding, agentOf, assertSources, bySeverity } from '../runs';
import { underpricedFindings } from '../engine/prices';
import { reviewThemeFinding } from '../engine/reviews';
import { listingFinding, listingsDisagree } from '../engine/listings';
import { checkSite as runSiteCheck, noWebsiteFinding, siteFindings, UA } from '../engine/sitecheck';
import { allowedCents, badFigures } from '../engine/drafts';
import { formatCents } from '../engine/money';
import { config } from '../config';
import { currentJob } from '../crew/jobs';
import { RoomSchema, defineTool, type ToolDef } from './define';

const cents = z.number().int().positive().max(1_000_000).describe('Price in integer cents: $4.50 → 450');

// ---------- shift basics ----------

export const getRun = defineTool({
  name: 'get_run',
  description: 'Read the whole run: business, items, competitors, sources, findings (with facts), fixes and totals.',
  agents: 'all',
  input: {},
  async run({ runId }) {
    return mustGetRun(runId);
  },
});

export const clockIn = defineTool({
  name: 'clock_in',
  description: 'Start your part of the shift. Call this first.',
  agents: 'all',
  input: {},
  async run({ runId, agent }) {
    const { run } = await mutate(runId, ({ run, shift, emit }) => {
      const a = agentOf(run, agent);
      const from = a.room;
      a.status = 'clocked_in';
      a.room = a.home;
      a.message = 'On shift';
      const job = shift.jobs[currentJob(agent, shift)];
      if (job && !job.clockedInAt) job.clockedInAt = nowIso();
      emit('agent.clocked_in', {}, { agent, room: a.home });
      emit('agent.moved', { from, to: a.home }, { agent, room: a.home });
    });
    return { ok: true, business: run.business?.name ?? null };
  },
});

export const status = defineTool({
  name: 'status',
  description: 'Update your badge line and progress (0-100). Optionally move to a room.',
  agents: 'all',
  input: { message: z.string().min(1).max(200), progress: z.number().min(0).max(100).optional(), room: RoomSchema.optional() },
  async run({ runId, agent, message, progress, room }) {
    await mutate(runId, ({ run, emit }) => {
      const a = agentOf(run, agent);
      if (a.status === 'off' || a.status === 'clocked_in') a.status = 'working';
      a.message = message;
      if (progress != null) a.progress = Math.round(progress);
      if (room && room !== a.room) {
        emit('agent.moved', { from: a.room, to: room }, { agent, room });
        a.room = room;
      }
      emit('agent.status', { message, progress: a.progress }, { agent, room: a.room });
    });
    return { ok: true };
  },
});

export const think = defineTool({
  name: 'think',
  description: 'One short line (max 120 chars) about what you are about to do, e.g. "search: cold brew price near Valencia St". Call before each search or page.',
  agents: 'all',
  input: { text: z.string().min(1).max(400) },
  async run({ runId, agent, text }) {
    const t = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    await mutate(runId, ({ run, emit }) => {
      const a = agentOf(run, agent);
      a.thinking = t;
      if (a.status === 'off' || a.status === 'clocked_in') a.status = 'working';
      emit('agent.thinking', { text: t }, { agent, room: a.room });
    });
    return { ok: true };
  },
});

export const done = defineTool({
  name: 'done',
  description: 'Finish your part of the shift with a one-sentence summary. Afterhours decides who goes next.',
  agents: 'all',
  input: { summary: z.string().min(1).max(400) },
  async run({ runId, agent, summary }) {
    const { finishJob } = await import('../crew/shift');
    await finishJob(runId, agent, { summary, ok: true });
    return { ok: true };
  },
});

// ---------- sources and facts ----------

async function probe(url: string): Promise<number | undefined> {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(3000) });
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status === 501)) continue;
      return res.status;
    } catch {
      if (method === 'GET') return undefined;
    }
  }
  return undefined;
}

export const addSource = defineTool({
  name: 'add_source',
  description: 'Register a public page before you use anything from it. Returns { sourceId }. kind: website | menu | maps | reviews | x_post | directory | news.',
  agents: 'all',
  input: {
    url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'http(s) only'),
    title: z.string().min(1).max(200),
    kind: z.enum(['website', 'menu', 'maps', 'reviews', 'x_post', 'directory', 'news']),
    quote: z.string().max(1000).optional(),
  },
  async run({ runId, agent, url, title, kind, quote }) {
    await mustGetRun(runId);
    const httpStatus = await probe(url);
    const { result } = await mutate(runId, ({ run, emit }) => {
      const existing = run.sources.find((s) => s.url === url && s.kind === kind);
      if (existing) return { sourceId: existing.id, httpStatus: existing.httpStatus, existed: true };
      const source: Source = {
        id: `src_${run.sources.length + 1}`,
        url,
        title,
        kind,
        ...(quote ? { quote: quote.slice(0, 200) } : {}),
        fetchedAt: nowIso(),
        foundBy: agent,
        ...(httpStatus ? { httpStatus } : {}),
      };
      run.sources.push(source);
      emit('source.found', { source }, { agent, room: agentOf(run, agent).room });
      return { sourceId: source.id, httpStatus };
    });
    return result;
  },
});

export const setBusiness = defineTool({
  name: 'set_business',
  description: 'Rosa: fill in the business you resolved. hours: one entry per source that states them.',
  agents: ['rosa'],
  input: {
    name: z.string().min(1).max(120),
    category: z.string().max(80).optional(),
    address: z.string().max(200).optional(),
    city: z.string().max(80).optional(),
    website: z.string().url().optional(),
    phone: z.string().max(40).optional(),
    timezone: z.string().max(60).optional(),
    hours: z.array(z.strictObject({ label: z.string().max(60), text: z.string().max(300), sourceId: z.string() })).max(6).optional(),
    rating: z.strictObject({ value: z.number().min(0).max(5), count: z.number().int().min(0), sourceId: z.string() }).optional(),
    sourceIds: z.array(z.string()).min(1),
  },
  async run({ runId, agent, sourceIds, hours, rating, ...fields }) {
    const { run } = await mutate(runId, ({ run, emit }) => {
      assertSources(run, [...sourceIds, ...(hours ?? []).map((h) => h.sourceId), ...(rating ? [rating.sourceId] : [])], 'the business');
      const prev = run.business;
      const business: Business = {
        id: prev?.id ?? newId('biz'),
        ...prev,
        ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
        name: fields.name,
        ...(hours ? { hours } : {}),
        ...(rating ? { rating } : {}),
        items: prev?.items ?? [],
        sourceIds: [...new Set([...(prev?.sourceIds ?? []), ...sourceIds])],
      };
      run.business = business;
      emit('business.resolved', { business }, { agent, room: 'front_desk' });
    });
    return { ok: true, businessId: run.business!.id };
  },
});

export const addMenuItems = defineTool({
  name: 'add_menu_items',
  description: "Rosa: the business's own items with clear prices (up to 15), each with the sourceId of the page where you read the price.",
  agents: ['rosa'],
  input: {
    items: z.array(z.strictObject({ name: z.string().min(1).max(80), size: z.string().max(30).optional(), priceCents: cents, sourceId: z.string() })).min(1).max(25),
  },
  async run({ runId, agent, items }) {
    const { result } = await mutate(runId, ({ run, emit }) => {
      if (!run.business) throw new ApiErr('conflict', 'Call set_business first');
      assertSources(run, items.map((i) => i.sourceId), 'menu items');
      const b = run.business;
      const ids: { name: string; itemId: string }[] = [];
      for (const it of items) {
        const same = b.items.find((x) => x.name.toLowerCase() === it.name.toLowerCase() && (x.size ?? '') === (it.size ?? ''));
        if (same) {
          Object.assign(same, it);
          ids.push({ name: it.name, itemId: same.id });
        } else if (b.items.length < 40) {
          const id = `item_${b.items.length + 1}`;
          b.items.push({ id, ...it });
          ids.push({ name: it.name, itemId: id });
        }
      }
      emit('business.resolved', { business: b }, { agent, room: 'front_desk' });
      return { items: ids };
    });
    return result;
  },
});

export const addCompetitor = defineTool({
  name: 'add_competitor',
  description: 'Vic: add a nearby competitor and their prices. Set matchesItemId only when the item is the same kind AND size as one of ours (ids from get_run).',
  agents: ['vic'],
  input: {
    name: z.string().min(1).max(120),
    address: z.string().max(200).optional(),
    distanceM: z.number().min(0).max(50_000).optional(),
    website: z.string().url().optional(),
    rating: z.strictObject({ value: z.number().min(0).max(5), count: z.number().int().min(0) }).optional(),
    items: z.array(z.strictObject({ name: z.string().min(1).max(80), size: z.string().max(30).optional(), priceCents: cents, sourceId: z.string(), matchesItemId: z.string().optional() })).max(30),
    sourceIds: z.array(z.string()).min(1),
  },
  async run({ runId, agent, items, sourceIds, ...fields }) {
    const { result } = await mutate(runId, ({ run, emit }) => {
      assertSources(run, [...sourceIds, ...items.map((i) => i.sourceId)], 'the competitor');
      const ours = new Set(run.business?.items.map((i) => i.id) ?? []);
      const dropped: string[] = [];
      const existing = run.competitors.find((c) => c.name.toLowerCase() === fields.name.toLowerCase());
      const id = existing?.id ?? newId('cmp');
      const competitor: Competitor = {
        id,
        ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
        name: fields.name,
        items: items.map((it, i) => {
          const m = it.matchesItemId && ours.has(it.matchesItemId) ? it.matchesItemId : undefined;
          if (it.matchesItemId && !m) dropped.push(it.matchesItemId);
          return { id: `${id}_item_${i + 1}`, name: it.name, ...(it.size ? { size: it.size } : {}), priceCents: it.priceCents, sourceId: it.sourceId, ...(m ? { matchesItemId: m } : {}) };
        }),
        sourceIds,
      };
      if (existing) Object.assign(existing, competitor);
      else {
        if (run.competitors.length >= 6) throw new ApiErr('conflict', 'Already 6 competitors; call check_prices');
        run.competitors.push(competitor);
      }
      emit('competitor.found', { competitor }, { agent, room: 'street' });
      return { competitorId: id, matched: competitor.items.filter((i) => i.matchesItemId).length, ...(dropped.length ? { warning: `Unknown matchesItemId ignored: ${dropped.join(', ')}` } : {}) };
    });
    return result;
  },
});

// ---------- the engine-backed checks ----------

export const checkPrices = defineTool({
  name: 'check_prices',
  description: 'Vic: after adding competitors, run the engine. It computes underpriced findings itself. Call once.',
  agents: ['vic'],
  input: {},
  async run({ runId, agent }) {
    const { result } = await mutate(runId, ({ run, emit }) => {
      if (!run.business) throw new ApiErr('conflict', 'No business yet');
      // Replace earlier underpriced findings that have no fix yet (idempotent re-run).
      const keep = run.findings.filter((f) => f.kind !== 'underpriced' || run.fixes.some((x) => x.findingId === f.id));
      run.findings = keep;
      const units: Record<string, { n: number; basis: 'books' | 'owner' }> = {};
      for (const f of keep) if (f.kind === 'underpriced' && f.fix.itemId && f.impact.inputs?.unitsPerDay) units[f.fix.itemId] = { n: f.impact.inputs.unitsPerDay, basis: f.impact.basis === 'books' ? 'books' : 'owner' };
      const fresh = underpricedFindings(run.business, run.competitors).filter((f) => !keep.some((k) => k.kind === 'underpriced' && k.fix.itemId === f.fix.itemId));
      const created = fresh.map((f) => addFinding(run, f, emit));
      const matched = run.business.items.filter((i) => run.competitors.filter((c) => c.items.some((x) => x.matchesItemId === i.id)).length >= 2).length;
      emit('agent.status', { message: created.length ? `${created.length} item${created.length > 1 ? 's' : ''} under the street` : `Checked ${matched} matched item${matched === 1 ? '' : 's'}: prices are in line`, progress: 90 }, { agent, room: 'shop_floor' });
      return { findings: created.map((f) => ({ id: f.id, title: f.title, facts: f.facts })), itemsWithTwoOrMoreMatches: matched };
    });
    return result;
  },
});

export const reportReviewTheme = defineTool({
  name: 'report_review_theme',
  description: 'June: report a complaint theme with at least 2 mentions from at least 2 different sources (exact short quotes, dates, stars when shown) and one practical suggestion.',
  agents: ['june'],
  input: {
    theme: z.string().min(2).max(80),
    mentions: z.array(z.strictObject({ sourceId: z.string(), quote: z.string().min(1).max(600), date: z.string().max(40).optional(), stars: z.number().min(0).max(5).optional() })).min(2).max(12),
    suggestion: z.string().min(1).max(400),
  },
  async run({ runId, agent, theme, mentions, suggestion }, ctx) {
    const { result } = await mutate(runId, ({ run, emit }) => {
      assertSources(run, mentions.map((m) => m.sourceId), 'review mentions');
      let nf;
      try {
        nf = reviewThemeFinding(theme, mentions, suggestion, ctx.now);
      } catch (e) {
        throw new ApiErr('invalid_request', (e as Error).message);
      }
      const dup = run.findings.find((f) => f.kind === 'review_theme' && f.facts.theme === nf.facts.theme);
      if (dup) return { findingId: dup.id, duplicate: true };
      const f = addFinding(run, nf, emit);
      return { findingId: f.id, title: f.title, severity: f.severity };
    });
    return result;
  },
});

export const checkSite = defineTool({
  name: 'check_site',
  description: "Otto: our server checks the business website (up to 15 pages), tests every order/menu/booking link, reads hours. Creates broken_link and missing_online findings itself and returns the report (incl. hours found) for you to compare with listings.",
  agents: ['otto'],
  input: { url: z.string().url().optional() },
  async run({ runId, agent, url }) {
    const run0 = await mustGetRun(runId);
    const target = url ?? run0.business?.website;
    if (!target) {
      const { result } = await mutate(runId, ({ run, emit }) => {
        if (run.findings.some((f) => f.kind === 'missing_online' && f.title.startsWith('No website'))) return { website: null, duplicate: true };
        const ids = run.business?.sourceIds ?? [];
        assertSources(run, ids, 'the no-website finding');
        const f = addFinding(run, noWebsiteFinding(ids), emit);
        return { website: null, findingId: f.id };
      });
      return result;
    }
    await mutate(runId, ({ run, emit }) => {
      const a = agentOf(run, agent);
      a.thinking = `check_site: ${new URL(target).host}`;
      emit('agent.thinking', { text: a.thinking }, { agent, room: a.room });
    });
    const report = await runSiteCheck(target);
    const { result } = await mutate(runId, ({ run, emit }) => {
      run.usage.pagesChecked += report.pagesChecked;
      const mk = (u: string, title: string, httpStatus: number | null): Source => {
        const s: Source = { id: `src_${run.sources.length + 1}`, url: u, title, kind: 'site_check', fetchedAt: nowIso(), foundBy: agent, ...(httpStatus ? { httpStatus } : {}) };
        run.sources.push(s);
        emit('source.found', { source: s }, { agent, room: 'server_closet' });
        return s;
      };
      const home = mk(report.url, `Site check: ${new URL(report.url).host} (${report.pagesChecked} pages)`, report.homepageStatus);
      const linkIds: Record<string, string> = {};
      for (const l of report.links.filter((x) => !x.ok)) linkIds[l.url] = mk(l.url, `Site check: ${l.kind} link "${l.text || l.url}"`, l.status).id;
      const existingTitles = new Set(run.findings.map((f) => f.title));
      const created = siteFindings(report, home.id, linkIds).filter((f) => !existingTitles.has(f.title)).map((f) => addFinding(run, f, emit));
      return { report, findings: created.map((f) => ({ id: f.id, title: f.title })) };
    });
    return result;
  },
});

export const reportListingIssue = defineTool({
  name: 'report_listing_issue',
  description: 'Otto: hours, phone or address that disagree between sources. Send at least 2 values side by side; the engine checks they really differ.',
  agents: ['otto'],
  input: {
    field: z.enum(['hours', 'phone', 'address']),
    values: z.array(z.strictObject({ label: z.string().min(1).max(60), text: z.string().min(1).max(300), sourceId: z.string() })).min(2).max(5),
  },
  async run({ runId, agent, field, values }) {
    const { result } = await mutate(runId, ({ run, emit }) => {
      assertSources(run, values.map((v) => v.sourceId), 'listing values');
      const pair = listingsDisagree(field, values);
      if (!pair) return { created: false, reason: `After normalizing, the ${field} values agree. Nothing to fix.` };
      const nf = listingFinding(field, pair);
      if (run.findings.some((f) => f.kind === 'listing_mismatch' && f.facts.field === field)) return { created: false, reason: 'Already reported' };
      const f = addFinding(run, nf, emit);
      return { created: true, findingId: f.id, title: f.title };
    });
    return result;
  },
});

// ---------- fixes and texting ----------

/** Fix numbers follow severity order; frozen once Rosa has texted the list. */
export function renumber(fixes: Fix[], findings: import('../types').Finding[]) {
  const order = [...findings].sort(bySeverity).map((f) => f.id);
  fixes.sort((a, b) => order.indexOf(a.findingId) - order.indexOf(b.findingId)).forEach((x, i) => (x.number = i + 1));
}

export const draftFix = defineTool({
  name: 'draft_fix',
  description: "Fern: draft one fix for a finding. Use only $ figures that appear in that finding's facts; anything else is rejected (422 bad_draft). body: the reply / listing text / site fix.",
  agents: ['fern'],
  input: {
    findingId: z.string(),
    title: z.string().min(3).max(160),
    body: z.string().max(2000).optional(),
    subject: z.string().max(160).optional(),
    to: z.string().email().optional(),
  },
  async run({ runId, agent, findingId, title, body, subject, to }) {
    const { result, run } = await mutate(runId, ({ run, shift, emit }) => {
      const finding = run.findings.find((f) => f.id === findingId);
      if (!finding) throw new ApiErr('not_found', `No finding ${findingId}`);
      const bad = badFigures([body, subject], allowedCents(finding.facts));
      // A price-change title may only name our price and the recommended one (not a competitor's).
      const titleFacts = finding.fix.type === 'price_change' ? { ours: finding.facts.ours, recommended: finding.facts.recommended } : finding.facts;
      bad.push(...badFigures([title], allowedCents(titleFacts)));
      if (bad.length) throw new ApiErr('bad_draft', `These figures aren't in the finding's facts (a price-change title uses only ours and recommended): ${bad.join(', ')}. Allowed: ${Object.values(finding.facts).filter((v) => v.includes('$')).join(' | ') || 'no dollar figures'}`);
      if (to && !config().mailAllowlist.includes(to.toLowerCase())) throw new ApiErr('invalid_request', `${to} is not in MAIL_ALLOWLIST. We never email third parties.`);
      let fix = run.fixes.find((x) => x.findingId === findingId);
      if (fix && fix.status !== 'drafted') throw new ApiErr('conflict', `Fix ${fix.number} is already ${fix.status}`);
      const fields = {
        type: finding.fix.type,
        title,
        ...(body ? { body } : {}),
        ...(subject ? { subject } : {}),
        ...(to ? { to } : {}),
        ...(finding.fix.type === 'price_change' && finding.fix.itemId ? { priceChange: { itemId: finding.fix.itemId, fromCents: finding.fix.fromCents!, toCents: finding.fix.toCents! } } : {}),
      };
      if (fix) Object.assign(fix, fields);
      else {
        fix = { id: newId('fix'), number: run.fixes.length + 1, findingId, status: 'drafted', draftedBy: agent, ...fields };
        run.fixes.push(fix);
      }
      if (!shift.approvalSent) renumber(run.fixes, run.findings);
      emit('fix.drafted', { fix }, { agent, room: 'mailroom' });
      const allDrafted = run.findings.every((f) => run.fixes.some((x) => x.findingId === f.id));
      if (allDrafted) emit('approval.requested', { fixIds: run.fixes.map((x) => x.id) }, { agent: 'fern', room: 'front_desk' });
      return { fixId: fix.id, number: fix.number, remaining: run.findings.filter((f) => !run.fixes.some((x) => x.findingId === f.id)).map((f) => f.id) };
    });
    await indexFix(result.fixId, run.id);
    return result;
  },
});

export const textOwner = defineTool({
  name: 'text_owner',
  description: "Rosa: text the owner (max 480 chars). Use fix numbers and totals exactly as get_run gives them. kind: 'approval' after Fern, 'alert' for an early heads-up.",
  agents: ['rosa'],
  input: { body: z.string().min(1).max(480), kind: z.enum(['alert', 'approval', 'brief', 'answer', 'confirm', 'welcome']) },
  async run({ runId, body, kind }) {
    const { sendRunText } = await import('../text/send');
    return sendRunText(runId, body, kind);
  },
});

export const tools: ToolDef<any>[] = [
  getRun, clockIn, status, think, addSource, setBusiness, addMenuItems, addCompetitor, checkPrices,
  reportReviewTheme, checkSite, reportListingIssue, draftFix, textOwner, done,
];

export const toolByName = (name: string) => tools.find((t) => t.name === name);

export const toolsFor = (agent: import('../types').AgentId) => tools.filter((t) => t.agents === 'all' || t.agents.includes(agent));

export { formatCents };
