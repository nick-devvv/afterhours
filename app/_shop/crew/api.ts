// The real thing: the Afterhours API (docs/MVP_SPEC.md, "API contract"). Attaches to the run the landing
// page created (?run=<id>), polls /events every 700 ms, and posts approvals. The API speaks lib/types.ts;
// this file translates it into the 3D shop's own event vocabulary (./engine-types), so the engine
// never needs to know the contract.
import type * as AH from '@/lib/types';
import type { AgentId, Crew, CrewHooks, Finding, Fix, PlumbEvent, Shop } from './types';

/** Afterhours crew → the shop's sprites (same rooms and walk paths as before). */
const AGENT: Record<AH.AgentId, AgentId> = { rosa: 'penny', vic: 'scout', june: 'dock', otto: 'sid', lou: 'audrey', dot: 'audrey', fern: 'felix' };
const toAgent = (a?: string) => (a && a in AGENT ? AGENT[a as AH.AgentId] : (a as AgentId | undefined));

interface Health { ok: boolean; crew: AH.CrewMode; xai?: boolean; text?: string }

export class ApiCrew implements Crew {
  readonly kind = 'api' as const;
  label = 'Connecting to the crew';
  books = null;
  shop: Shop | null = null;
  private runId = '';
  private after = 0;
  private finished = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private sources = new Map<string, AH.Source>();
  private findings = new Map<string, AH.Finding>();
  private lastThought = new Map<string, number>();
  private shopName = 'Your business';
  private clocked = new Set<string>();

  constructor(private hooks: CrewHooks, private base = '', _sample?: string) {
    if (typeof window !== 'undefined') this.runId = new URLSearchParams(window.location.search).get('run') ?? '';
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await fetch(this.base.replace(/\/$/, '') + path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error?.message ?? `${method} ${path} failed (${r.status})`);
    return j as T;
  }

  async health() {
    const h = await this.req<Health>('GET', '/api/health');
    this.label = h.crew === 'grokbot' ? 'GROK BOT CREW · live' : 'GROK API CREW · live';
    this.hooks.relabel?.(this.label);
    return h;
  }

  async start() {
    if (!this.runId) {
      this.hooks.notice?.('Pick a business on the home page first, then the crew comes here.');
      return;
    }
    this.health().catch(() => {});
    const run = await this.req<AH.Run>('GET', `/api/runs/${encodeURIComponent(this.runId)}`);
    for (const s of run.sources ?? []) this.sources.set(s.id, s);
    for (const f of run.findings ?? []) this.findings.set(f.id, f);
    this.shopName = run.business?.name ?? run.query ?? this.shopName;
    this.shop = this.toShop(run.business, run.query);
    this.poll();
  }

  // ---------------------------------------------------------------- translation
  private toShop(b: AH.Business | null | undefined, query?: string): Shop {
    const items = b?.items ?? [];
    return {
      id: b?.id ?? this.runId, name: b?.name ?? query ?? this.shopName, city: b?.city ?? '', fictional: false,
      counts: { expenses: 0, sales: 0, products: items.length },
      products: items.slice(0, 12).map((i) => ({ sku: i.id, name: i.size ? `${i.name} ${i.size}` : i.name, priceCents: i.priceCents })),
      suppliers: [], subscriptions: [],
    };
  }

  private toFinding(f: AH.Finding): Finding {
    const evidence = f.sourceIds.map((id) => this.sources.get(id)).filter((s): s is AH.Source => !!s).map((s) => ({
      source: 'web' as const, rowId: s.id, url: s.url,
      label: s.quote ? `${s.title} · “${s.quote}”` : s.title,
      date: s.fetchedAt?.slice(0, 10),
    }));
    const detail = f.impact.basis === 'estimate' && f.impact.assumptions.length
      ? `${f.detail} Estimate: ${f.impact.assumptions.join(' ')}`
      : f.impact.basis === 'books' ? `${f.detail} From your books.` : f.detail;
    return {
      id: f.id, kind: f.kind, room: f.room, agent: toAgent(f.agent)!, title: f.title, detail,
      oneTimeCents: f.impact.oneTimeCents, monthlyCents: f.impact.monthlyCents, firstYearCents: f.impact.firstYearCents,
      facts: f.facts, evidence,
      fix: { type: f.fix.type, sku: f.fix.itemId, fromCents: f.fix.fromCents, toCents: f.fix.toCents, to: f.fix.to },
    } as Finding;
  }

  private toFix(x: AH.Fix): Fix {
    return {
      id: x.id, findingId: x.findingId, type: x.type, status: x.status, to: x.to, subject: x.subject ?? x.title, body: x.body,
      priceChange: x.priceChange ? { sku: x.priceChange.itemId, fromCents: x.priceChange.fromCents, toCents: x.priceChange.toCents } : undefined,
      draftedBy: toAgent(x.draftedBy)!, sentVia: x.sentVia, error: x.error, title: x.title, number: x.number,
    } as Fix;
  }

  /** One Afterhours event → zero or more shop events. */
  private translate(e: AH.AfterhoursEvent): PlumbEvent[] {
    const base = { seq: e.seq, at: e.at, runId: e.runId, agent: toAgent(e.agent), room: e.room };
    const d = e.data as Record<string, unknown>;
    const ev = (type: PlumbEvent['type'], data: Record<string, unknown>, agent = base.agent): PlumbEvent =>
      ({ ...base, agent, type, data } as PlumbEvent);
    switch (e.type) {
      case 'run.created':
        return [ev('run.created', { shop: this.shop ?? this.toShop(null, String(d.query ?? '')) })];
      case 'run.started': {
        // The whole crew walks in for the shift right away; each one gets to work when their job starts.
        const all: AgentId[] = ['penny', 'scout', 'dock', 'sid', 'audrey', 'felix'];
        const walkIns = all.filter((a) => !this.clocked.has(a)).map((a) => { this.clocked.add(a); return ev('agent.clocked_in', {}, a); });
        return [ev('run.started', { crew: d.crew }), ...walkIns];
      }
      case 'agent.clocked_in': {
        const a = base.agent ?? '';
        if (this.clocked.has(a)) return [ev('agent.status', { message: 'On the job', progress: 5 })];
        this.clocked.add(a);
        return [ev('agent.clocked_in', d)];
      }
      case 'business.resolved': {
        const b = d.business as AH.Business;
        this.shopName = b.name;
        this.shop = this.toShop(b);
        return [ev('intake.done', { counts: this.shop.counts, products: this.shop.products, suppliers: [], subscriptions: [] }, 'penny')];
      }
      case 'source.found': {
        const s = d.source as AH.Source;
        this.sources.set(s.id, s);
        return [];
      }
      case 'competitor.found': {
        const c = d.competitor as AH.Competitor;
        return [ev('agent.status', { message: `Found ${c.name}: ${c.items.length} prices`, progress: undefined }, 'scout')];
      }
      case 'agent.thinking': {
        // The director plays one beat at a time; keep at most one thought per agent every 4 s.
        const now = Date.parse(e.at) || Date.now();
        const key = String(e.agent);
        if (now - (this.lastThought.get(key) ?? 0) < 4000) return [];
        this.lastThought.set(key, now);
        return [ev('agent.status', { message: String(d.text ?? '') })];
      }
      case 'finding.created': {
        const f = d.finding as AH.Finding;
        this.findings.set(f.id, f);
        return [ev('finding.created', { finding: this.toFinding(f) }, toAgent(f.agent))];
      }
      case 'fix.drafted':
        return [ev('fix.drafted', { fix: this.toFix(d.fix as AH.Fix) }, 'felix')];
      case 'fix.applied':
        return [ev('fix.applied', { fixId: d.fixId, sku: d.itemId, fromCents: d.fromCents, toCents: d.toCents })];
      case 'finding.updated': case 'text.sent': case 'text.received':
        return [];   // texts show in the phone mirror (app/_ui/PhoneMirror.tsx)
      default:
        return [ev(e.type as PlumbEvent['type'], d)];
    }
  }

  private poll = async () => {
    if (this.disposed || !this.runId) return;
    try {
      const r = await this.req<{ events: AH.AfterhoursEvent[]; next: number }>('GET', `/api/runs/${encodeURIComponent(this.runId)}/events?after=${this.after}`);
      for (const e of [...r.events].sort((a, b) => a.seq - b.seq)) {
        if (e.seq <= this.after) continue;
        this.after = e.seq;
        for (const out of this.translate(e)) this.hooks.emit(out);
        if (e.type === 'run.finished') this.finished = true;
      }
    } catch (err) {
      this.hooks.error((err as Error).message);
    }
    if (!this.disposed) this.timer = setTimeout(this.poll, this.finished ? 3000 : 700);
  };

  async approve(fixId: string) { await this.req('POST', `/api/fixes/${encodeURIComponent(fixId)}/approve`, { via: 'web' }); }
  async reject(fixId: string) { await this.req('POST', `/api/fixes/${encodeURIComponent(fixId)}/reject`, {}); }
  tick() {}
  dispose() { this.disposed = true; if (this.timer) clearTimeout(this.timer); }
}
