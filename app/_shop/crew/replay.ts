// REPLAY, recorded run: plays data/demo/recorded-run.json (a real mock shift recorded from the API)
// up to the owner's desk. The shop's stage paces it, one beat at a time. Your approvals then play out locally,
// so the demo works with no API at all: on the design canvas, and as the app's fallback.
import { LocalCrew } from './local';
import type { CrewHooks, PlumbEvent, RecordedRun, Shop } from './types';

const DECISIONS = new Set<PlumbEvent['type']>(['fix.approved', 'fix.rejected', 'fix.applied', 'fix.sent', 'fix.failed', 'agent.clocked_out', 'run.finished']);

/** The recording comes out quickly and in order; the shop's stage (engine/shop.ts) decides how long each beat holds. */
const GAP = 0.05;

export class ReplayCrew extends LocalCrew {
  readonly kind = 'replay' as const;
  label = 'REPLAY · recorded run';
  private recorded: RecordedRun | null;

  constructor(hooks: CrewHooks, private source: string | RecordedRun) {
    super(hooks);
    this.recorded = typeof source === 'string' ? null : source;
    if (this.recorded) this.shop = shopOf(this.recorded);
  }

  async load() {
    if (this.recorded) return this.recorded;
    const r = await fetch(this.source as string);
    if (!r.ok) throw new Error(`Couldn't load the recorded run (${r.status})`);
    this.recorded = (await r.json()) as RecordedRun;
    this.shop = shopOf(this.recorded);
    return this.recorded;
  }

  async start() {
    const rec = await this.load();
    let t = 0;
    for (const e of [...rec.events].sort((a, b) => a.seq - b.seq)) {
      if (DECISIONS.has(e.type)) break;          // from here on, the owner decides live
      t += GAP;
      this.tl.at(t, () => this.emit(e.type, e.data ?? {}, e.agent, e.room));
    }
  }
}

function shopOf(r: RecordedRun): Shop | null {
  return (r.events.find((e) => e.type === 'run.created')?.data.shop as Shop | undefined) ?? r.run?.shop ?? null;
}
