// What the 3D shop listens to. Everything comes from lib/types.ts (Advik's contract);
// the few extras below are optional, so the shop works with or without them.
import type { AgentId, Evidence, Finding, Fix, LeakKind, PlumbEvent, Room, Shop, Totals } from './engine-types';

export type { AgentId, Evidence, Finding, Fix, LeakKind, PlumbEvent, Room, Shop, Totals };

/** Rooms the 3D shop has. The API never sends 'roastery': it's where agents take their coffee break. */
export type ShopRoom = Room | 'roastery';

/** Optional, richer proof for the "Show me the proof" panel. Without it the panel lists `evidence`. */
export type Proof =
  | { kind: 'payments'; columns: string[]; rows: { cells: string[]; hot: boolean }[]; note: string }
  | { kind: 'monthly'; vendor: string; months: string[]; cents: number[]; hotFrom: number;
      others: { name: string; fromCents: number; toCents: number; pct: number; flagged: boolean }[]; note: string }
  | { kind: 'margin'; product: string; priceCents: number; newPriceCents: number;
      periods: { label: string; costCents: number; margin: number }[]; unitsPerMonth: number;
      street: { name: string; cents: number }[]; note: string }
  | { kind: 'street'; product: string; oursCents: number; newPriceCents: number; medianCents: number;
      street: { name: string; cents: number }[]; unitsPerMonth: number; pctUnder: number; note: string };

/** A Finding as the UI uses it: the contract's Finding plus two optional extras. */
export type UIFinding = Finding & { proof?: Proof; rule?: string };

/** A peek at the uploaded files for June's panel. Optional: no crew sends it yet. */
export interface Books {
  from: string; to: string; revenueCents: number;
  files: { name: string; rows: number; columns: string[]; sample: string[][] }[];
  subscriptions: string[];
  competitors: { name: string; prices: Record<string, number> }[];
}

export type CrewKind = 'replay' | 'api';

/** Where events come from. The shop doesn't care which one it gets. */
export interface Crew {
  readonly kind: CrewKind;
  label: string;
  books: Books | null;
  /** Shop shown before the run starts (the API sends its own in run.created). */
  shop: Shop | null;
  start(): Promise<void>;
  approve(fixId: string): Promise<void>;
  reject(fixId: string): Promise<void>;
  /** Game time, so the speed buttons work for the demo and replay crews. The API crew ignores it. */
  tick(dt: number): void;
  dispose(): void;
}

export interface CrewHooks {
  emit(e: PlumbEvent): void;
  error(message: string): void;
  /** The crew learned something about itself (the API's health said "clawmax", say). */
  relabel?(label: string): void;
  /** Something the presenter has to do (start the Grok Bot workflow by hand, say). */
  notice?(message: string): void;
}

export interface RecordedRun { run?: { id?: string; shop?: Shop }; events: PlumbEvent[] }
