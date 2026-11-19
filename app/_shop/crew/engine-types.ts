// The 3D shop's internal event vocabulary (from Plumb). The Afterhours API speaks lib/types.ts;
// app/_shop/crew/api.ts translates it into these shapes. Don't import this outside app/_shop.
// THE CONTRACT. Mirrors the Data shapes section of docs/MVP_SPEC.md.
// Changing this means changing docs/MVP_SPEC.md in the same PR (see AGENTS.md).

export type Cents = number;                 // integer, always
export type AgentId = 'penny' | 'dock' | 'audrey' | 'sid' | 'scout' | 'felix';
export type Room =
  | 'loading_dock' | 'front_desk' | 'shop_floor' | 'stockroom'
  | 'back_office' | 'server_closet' | 'mailroom' | 'vault' | 'street';
export type LeakKind = 'duplicate_payment' | 'subscription_creep' | 'margin_erosion' | 'underpriced'
  | 'review_theme' | 'listing_mismatch' | 'broken_link' | 'missing_online';
export type CrewMode = 'mock' | 'clawmax';

export interface Shop {
  id: string; name: string; city: string;
  fictional: boolean;                       // true for the sample: the UI labels it
  counts: { expenses: number; sales: number; products: number };
  products: { sku: string; name: string; priceCents: Cents }[];   // shelf labels in the 3D shop
  suppliers: string[];                      // crates in the stockroom
  subscriptions: string[];                  // servers in the closet
}

export interface Agent {
  id: AgentId; name: string; role: string; job: string;   // job = the badge's one-liner
  home: Room; room: Room;                   // where they are now
  status: 'off' | 'clocked_in' | 'working' | 'waiting' | 'done';
  progress: number;                         // 0-100
  message?: string;                         // latest status line ("Checking 128 bills")
  foundCents: Cents;                        // first-year value of what they found
  skills: string[];
}

export interface Evidence {
  source: 'expenses' | 'sales' | 'catalog' | 'competitors' | 'web';
  url?: string;
  rowId: string;                            // e.g. "exp-0412": the UI lights these up
  label: string;                            // "Ridgeline Roasters · RR-1182 · Oct 3 · $1,240.00"
  amountCents?: Cents; date?: string;
}

export interface Finding {
  id: string; kind: LeakKind; room: Room; agent: AgentId;
  title: string;                            // "Invoice RR-1182 paid twice"
  detail: string;                           // one plain sentence, includes any assumption
  oneTimeCents: Cents; monthlyCents: Cents;
  firstYearCents: Cents;                    // oneTime + monthly * 12
  facts: Record<string, string>;            // preformatted figures Fern must use, e.g. { amount: "$1,240.00" }
  evidence: Evidence[];
  fix: { type: 'refund_request' | 'plan_downgrade' | 'price_change' | 'review_reply' | 'listing_update' | 'site_fix';
         to?: string; sku?: string; fromCents?: Cents; toCents?: Cents };
}

export interface Fix {
  id: string; findingId: string; type: Finding['fix']['type'];
  status: 'drafted' | 'approved' | 'rejected' | 'sent' | 'applied' | 'failed';
  to?: string; subject?: string; body?: string;           // emails
  priceChange?: { sku: string; fromCents: Cents; toCents: Cents };
  draftedBy: AgentId; sentVia?: 'clawmax-resend' | 'resend' | 'simulated' | 'copy' | 'ledger';
  error?: string;
}

export interface Totals {
  leakingCents: Cents;      // sum of firstYearCents over findings not yet fixed
  recoveredCents: Cents;    // sum over findings whose fix is sent or applied
  oneTimeCents: Cents; monthlyCents: Cents; findings: number;
}

export interface Run {
  id: string; shop: Shop; crew: CrewMode;
  status: 'created' | 'running' | 'awaiting_approval' | 'sending' | 'done' | 'failed';
  agents: Agent[]; findings: Finding[]; fixes: Fix[]; totals: Totals;
  createdAt: string; lastSeq: number;
}

export type EventType =
  | 'run.created' | 'run.started' | 'agent.clocked_in' | 'agent.moved' | 'agent.status'
  | 'intake.done' | 'finding.created' | 'fix.drafted' | 'approval.requested'
  | 'fix.approved' | 'fix.rejected' | 'fix.applied' | 'fix.sent' | 'fix.failed'
  | 'agent.clocked_out' | 'run.finished' | 'chat.reply' | 'error';

export interface PlumbEvent {
  seq: number;              // 1, 2, 3 ... per run, no gaps
  at: string;               // ISO time
  runId: string; type: EventType;
  agent?: AgentId; room?: Room;
  data: Record<string, unknown>;   // see the event table
}
