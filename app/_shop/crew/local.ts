// A crew that runs in the browser: the replay crew (a recorded run). It's REPLAY, and it emits the
// same PlumbEvents the API does, so the shop can't tell the difference. Amounts come from the recording
// and from lib/engine (computeTotals); nothing here does money math.
import { computeTotals } from './totals';
import type { AgentId, Books, Crew, CrewHooks, Fix, PlumbEvent, Room, Shop, UIFinding } from './types';

export const HOMES: Record<AgentId, Room> = {
  penny: 'front_desk', dock: 'loading_dock', audrey: 'back_office', sid: 'server_closet', scout: 'shop_floor', felix: 'mailroom',
};
export const CREW_ORDER: AgentId[] = ['penny', 'dock', 'audrey', 'sid', 'scout', 'felix'];

/** Events on a clock that the engine advances (so the speed buttons work). */
export class Timeline {
  clock = 0;
  private q: { t: number; run: () => void }[] = [];
  at(t: number, run: () => void) { this.q.push({ t, run }); }
  after(dt: number, run: () => void) { this.at(this.clock + dt, run); }
  tick(dt: number) {
    this.clock += dt;
    this.q.sort((a, b) => a.t - b.t);
    while (this.q.length && this.q[0].t <= this.clock) this.q.shift()!.run();
  }
  clear() { this.q = []; }
}

export abstract class LocalCrew implements Crew {
  abstract readonly kind: 'replay';
  abstract label: string;
  books: Books | null = null;
  shop: Shop | null = null;
  protected tl = new Timeline();
  protected seq = 0;
  protected runId = `local-${Date.now().toString(36)}`;
  protected findings = new Map<string, UIFinding>();
  protected fixes = new Map<string, Fix>();
  private closing = false;
  private disposed = false;

  constructor(protected hooks: CrewHooks) {}

  abstract start(): Promise<void>;

  protected emit(type: PlumbEvent['type'], data: Record<string, unknown> = {}, agent?: AgentId, room?: Room) {
    if (this.disposed) return;
    if (type === 'finding.created') { const f = data.finding as UIFinding; this.findings.set(f.id, f); }
    if (type === 'fix.drafted') { const x = data.fix as Fix; this.fixes.set(x.id, { ...x }); }
    this.hooks.emit({ seq: ++this.seq, at: new Date().toISOString(), runId: this.runId, type, agent, room, data });
  }

  tick(dt: number) { if (!this.disposed) this.tl.tick(dt); }
  dispose() { this.disposed = true; this.tl.clear(); }

  // The owner's desk, played locally: what the API does when a fix is approved or skipped.
  async approve(fixId: string) {
    const x = this.fixes.get(fixId);
    if (!x || x.status !== 'drafted') return;
    x.status = 'approved';
    this.emit('fix.approved', { fixId });
    if (x.type === 'price_change' && x.priceChange) {
      const pc = x.priceChange;
      this.tl.after(0.3, () => { x.status = 'applied'; this.emit('fix.applied', { fixId, sku: pc.sku, fromCents: pc.fromCents, toCents: pc.toCents }, undefined, 'shop_floor'); this.maybeClose(); });
    } else {
      this.tl.after(0.6, () => { x.status = 'sent'; x.sentVia = 'simulated'; this.emit('fix.sent', { fixId, via: 'simulated', to: x.to }, 'felix', 'mailroom'); this.maybeClose(); });
    }
  }

  async reject(fixId: string) {
    const x = this.fixes.get(fixId);
    if (!x || x.status !== 'drafted') return;
    x.status = 'rejected';
    this.emit('fix.rejected', { fixId });
    this.maybeClose();
  }

  private maybeClose() {
    const open = [...this.fixes.values()].some((x) => x.status === 'drafted' || x.status === 'approved');
    if (open || this.closing || !this.fixes.size) return;
    this.closing = true;
    this.tl.after(1.5, () => this.emit('agent.status', { message: 'Closing the shift. Everyone to the shop floor for the photo.', progress: 90 }, 'penny'));
    CREW_ORDER.forEach((id, i) => this.tl.after(2.0 + i * 0.35, () => this.emit('agent.clocked_out', { summary: '' }, id)));
    this.tl.after(2.0 + CREW_ORDER.length * 0.35 + 2.4, () => this.emit('run.finished', { totals: this.totals() }, 'penny'));
  }

  protected totals() {
    return computeTotals([...this.findings.values()], [...this.fixes.values()]);
  }
}
