// THE CONTRACT. Frontend, backend, the API crew and the Grok Bot crew all speak these shapes.
// Owner: Darian. Changing it = change this file + docs/MVP_SPEC.md in the same PR, and tell the team chat.
// Money is always integer cents. Times are ISO 8601 strings.

export type Cents = number;

// ---------- The crew ----------

export type AgentId =
  | 'rosa'  // night manager: runs the shift, texts the owner
  | 'vic'   // price checker: walks the street, compares menus
  | 'june'  // listener: reviews and X posts
  | 'otto'  // storefront: website and listings
  | 'lou'   // books: duplicate bills, creeping subscriptions, margins (P1)
  | 'fern'; // fixer: drafts the fixes and the replies

/** Rooms in the 3D shop. Same floor plan as Plumb's shop. */
export type Room =
  | 'front_desk' | 'street' | 'shop_floor' | 'stockroom' | 'back_office'
  | 'server_closet' | 'mailroom' | 'vault' | 'loading_dock';

/** Who is doing the work. Both are real. There is no mock crew. */
export type CrewMode = 'api' | 'grokbot';

export interface Agent {
  id: AgentId;
  name: string;            // "Rosa"
  role: string;            // "Night manager"
  job: string;             // badge one-liner: "Runs the shift and texts you"
  home: Room;
  room: Room;              // where they are now
  status: 'off' | 'clocked_in' | 'working' | 'waiting' | 'done' | 'failed';
  progress: number;        // 0-100
  message?: string;        // latest status line: "Comparing 9 drinks with 3 shops"
  thinking?: string;       // latest tool call, for the thought bubble: "search: cold brew price Mission St"
  via: CrewMode;           // which crew this agent ran on
}

// ---------- Real-world data (every piece has a source) ----------

export type SourceKind =
  | 'website' | 'menu' | 'maps' | 'reviews' | 'x_post' | 'directory' | 'news' | 'site_check' | 'books';

export interface Source {
  id: string;              // "src_12"
  url: string;             // required, http(s). site_check sources point at the URL that was checked
  title: string;           // "Tidepool Coffee · Menu"
  kind: SourceKind;
  quote?: string;          // at most 200 chars: the exact bit that matters
  fetchedAt: string;
  foundBy: AgentId;
  httpStatus?: number;     // filled when our server checked the URL itself
}

export interface MenuItem {
  id: string;              // "item_3"
  name: string;            // "Cold Brew"
  size?: string;           // "16 oz"
  priceCents: Cents;
  sourceId: string;
}

export interface Business {
  id: string;
  name: string;
  category?: string;       // "coffee shop"
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  timezone?: string;       // IANA, for day/night in the shop and quiet hours
  website?: string;
  phone?: string;
  /** Hours as each source states them, so mismatches are visible. */
  hours?: { label: string; text: string; sourceId: string }[];
  rating?: { value: number; count: number; sourceId: string };
  items: MenuItem[];       // the shop's own prices: shelves in the 3D shop
  sourceIds: string[];
}

/** A lookup result the owner picks from before the crew starts. */
export interface BusinessCandidate {
  name: string;
  address?: string;
  city?: string;
  category?: string;
  website?: string;
  sourceUrl: string;       // where we found it
  confidence: 'high' | 'medium' | 'low';
}

export interface Competitor {
  id: string;
  name: string;
  address?: string;
  distanceM?: number;
  website?: string;
  rating?: { value: number; count: number };
  /** Their prices. matchesItemId pairs an item with one of ours of the same kind and size. */
  items: (MenuItem & { matchesItemId?: string })[];
  sourceIds: string[];
}

// ---------- Findings and fixes ----------

export type LeakKind =
  | 'underpriced'          // vic: an item sells under the street
  | 'review_theme'         // june: customers keep complaining about the same thing
  | 'listing_mismatch'     // otto: hours, phone or address disagree between listings
  | 'broken_link'          // otto: an order, menu or booking link is broken (our server checked it)
  | 'missing_online'       // otto: no menu prices, no online ordering, no website
  | 'duplicate_payment'    // lou (books, P1)
  | 'subscription_creep'   // lou (books, P1)
  | 'margin_erosion';      // lou (books, P1)

export interface Impact {
  /** books = from the owner's own exports. estimate = public data plus stated assumptions. none = no dollar figure. */
  basis: 'books' | 'estimate' | 'none';
  oneTimeCents: Cents;
  monthlyCents: Cents;
  firstYearCents: Cents;   // oneTime + monthly * 12
  assumptions: string[];   // plain sentences: "Assumes 20 sold a day. Text me the real number."
  /** Knobs the owner can change by text or in the UI. The engine recomputes. */
  inputs?: Record<string, number>; // { unitsPerDay: 20 }
}

export type FixType =
  | 'price_change' | 'review_reply' | 'listing_update' | 'site_fix' | 'refund_request' | 'plan_downgrade';

export interface Finding {
  id: string;
  kind: LeakKind;
  agent: AgentId;
  room: Room;
  title: string;           // "Cold Brew is $0.75 under the street"
  detail: string;          // one or two plain sentences, any assumption included
  severity: 'high' | 'medium' | 'low';
  impact: Impact;          // computed by lib/engine, never typed by a model
  facts: Record<string, string>; // preformatted figures a draft must use exactly: { ours: "$4.50", median: "$5.25" }
  sourceIds: string[];     // at least one. The API rejects a finding without sources
  fix: { type: FixType; itemId?: string; fromCents?: Cents; toCents?: Cents; to?: string };
}

export interface Fix {
  id: string;
  number: number;          // 1, 2, 3 ... per run: what the owner types in "YES 2"
  findingId: string;
  type: FixType;
  status: 'drafted' | 'approved' | 'rejected' | 'sent' | 'applied' | 'failed';
  title: string;           // "Raise Cold Brew from $4.50 to $5.25"
  to?: string;             // emails only, and only to MAIL_ALLOWLIST
  subject?: string;
  body?: string;           // email text, review reply text, listing update text
  priceChange?: { itemId: string; fromCents: Cents; toCents: Cents };
  draftedBy: AgentId;
  decidedVia?: 'web' | 'text';
  /** resend = emailed (allowlist). copy = the owner copies the text to post it. ledger = recorded in Afterhours. */
  sentVia?: 'resend' | 'copy' | 'ledger';
  error?: string;
}

export interface Totals {
  findings: number;
  estimatedMonthlyCents: Cents;  // sum over basis 'estimate'
  booksMonthlyCents: Cents;      // sum over basis 'books'
  oneTimeCents: Cents;
  firstYearCents: Cents;         // everything open, first year
  fixedFirstYearCents: Cents;    // findings whose fix is approved and sent/applied
}

// ---------- Runs ----------

export interface Usage {
  xaiCalls: number;
  webSearches: number;
  xPostsFetched: number;
  pagesChecked: number;          // by our own site checker
  costCents?: Cents;             // from xAI usage fields when present
}

export interface Run {
  id: string;
  query: string;                 // what the owner or judge typed
  crew: CrewMode;
  status: 'created' | 'running' | 'awaiting_approval' | 'done' | 'failed';
  business: Business | null;
  competitors: Competitor[];
  sources: Source[];
  agents: Agent[];
  findings: Finding[];
  fixes: Fix[];
  totals: Totals;
  ownerId?: string;
  usage: Usage;
  createdAt: string;
  finishedAt?: string;
  lastSeq: number;
}

// ---------- The owner and texting ----------

export type TextChannel = 'imessage' | 'telegram' | 'sms';

export interface Owner {
  id: string;
  name: string;
  phone?: string;                // E.164, for iMessage/SMS
  telegramChatId?: string;
  channel: TextChannel;
  verified: boolean;             // they texted us first (Sendblue free plan) or tapped Start (Telegram)
  timezone: string;
  briefAt: string;               // "07:30" local
  quiet: { from: string; to: string }; // "21:00" → "07:00"
  stopped: boolean;              // replied STOP
  runIds: string[];
}

export interface TextMessage {
  id: string;
  ownerId: string;
  runId?: string;
  direction: 'out' | 'in';
  body: string;
  at: string;
  channel: TextChannel;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'received';
  kind?: 'welcome' | 'alert' | 'approval' | 'brief' | 'answer' | 'confirm';
  from?: AgentId;                // outbound: who "wrote" it (always rosa for now)
  error?: string;
}

// ---------- Events (the UI animates these; the log is append-only) ----------

export type EventType =
  | 'run.created' | 'run.started' | 'business.resolved'
  | 'agent.clocked_in' | 'agent.moved' | 'agent.status' | 'agent.thinking'
  | 'source.found' | 'competitor.found'
  | 'finding.created' | 'finding.updated'
  | 'fix.drafted' | 'approval.requested'
  | 'fix.approved' | 'fix.rejected' | 'fix.applied' | 'fix.sent' | 'fix.failed'
  | 'text.sent' | 'text.received'
  | 'agent.clocked_out' | 'run.finished' | 'error';

export interface AfterhoursEvent {
  seq: number;                   // 1, 2, 3 ... per run, no gaps
  at: string;
  runId: string;
  type: EventType;
  agent?: AgentId;
  room?: Room;
  data: Record<string, unknown>; // see docs/MVP_SPEC.md → Events
}

// ---------- API errors ----------

export type ErrorCode =
  | 'invalid_request' | 'unauthorized' | 'not_found' | 'bad_draft' | 'no_source'
  | 'conflict' | 'rate_limited' | 'upstream_failed' | 'server_error';

export interface ApiError { error: { code: ErrorCode; message: string } }
