# Backend and the crew: Darian

Branch: `darian/backend`. You own the whole backend: `app/api/`, `lib/`, `grokbot/`, `scripts/`, backend tests, and the contract (`lib/types.ts`). That includes texting (Rosa) and the books scan (P1). Nick owns the UI, Rayyan owns the deck.

Read [`MVP_SPEC.md`](MVP_SPEC.md) first, then this.

**Work with your Grok Bot.** Give it `AGENTS.md`, the spec and this file, and hand it one step at a time ("Do Step 2 in docs/BACKEND.md, then run npm test"). Have it open a PR per step. Log what it did in `docs/BUILD_LOG.md`. With one person on the backend, your Bot is your second backend engineer: let it write the engine and the tests while you wire the crew.

**Due 4:45 PM.** Follow the time plan in MVP_SPEC.md section 13. Today's cut: steps 0–5 with only Rosa, Vic and Otto, step 7 approvals, step 8 over **Telegram first**, deploy. Everything else is stretch.

**Full order of priority:** steps 0–7 (the API crew end to end) → step 8 (texting) → step 9 (deploy) → step 10 (Grok Bot crew) → step 11 (drill) → step 12 (morning brief) → step 13 (books).

## Accounts and keys (first 15 minutes)

| What | Where | Env |
| --- | --- | --- |
| xAI API key | console.x.ai | `XAI_API_KEY` |
| Vercel project | import `nick-devvv/afterhours`, production branch `main` | |
| Upstash Redis | Vercel → Storage → Marketplace → Upstash for Redis, connect to the project | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Agent token | `openssl rand -hex 24` | `AFTERHOURS_AGENT_TOKEN` |
| Grok Bot | x.ai/bot on your laptop (crew Bots live on your account) | `GROKBOT_WEBHOOK_*`, `GROKBOT_KEY_*` (step 9) |
| Sendblue (iMessage) | sendblue.com → free sandbox → API key id + secret, note the shared number | `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET`, `SENDBLUE_FROM` |
| Telegram bot (backup) | message @BotFather → `/newbot` → token | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` |
| Resend (optional) | resend.com, send to our own inboxes only | `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_ALLOWLIST` |

## Build order

Each step ends with something that works and a test. Merge to `main` at the checkpoints in the spec's build plan.

### Step 0: scaffold your side (0:00–0:30)

- Nick's Step 0 PR brings the Next.js shell (package.json, tsconfig, app/). Until it lands, work in `lib/` only; then rebase.
- Add: `zod`, `@upstash/redis`, `ai`, `@ai-sdk/xai`, `mcp-handler`, `@modelcontextprotocol/sdk` (peer of mcp-handler), `resend`, `vitest`. Check each package's README for the current version and API before writing code against it.
- `lib/config.ts`: read env once, typed, with defaults (`CREW=api`, `STORE=memory` locally).
- `lib/http.ts`: `ok(data)`, `fail(code, message)` with the status codes from the spec; `requireAgentToken(req)` accepts `Authorization: Bearer` or `?token=`.
- `/api/health`.

### Step 1: store and event log (0:30–0:50)

- `lib/store/{memory,redis,index}.ts`: `getRun`, `saveRun` (with a version check so two agents writing at once don't overwrite each other: retry on conflict), `appendEvent(runId, partial) → AfterhoursEvent` using `INCR runs:<id>:seq` so `seq` has no gaps, `readEvents(runId, after, limit=200)`. Owners and texts live here too.
- Every state change goes through one helper, `mutate(runId, fn) → { run, events }`, that loads the run, applies the change, appends events and saves. Tools and routes only call `mutate`.
- Tests: seq is gapless with 20 concurrent appends (memory store), `after=N` paging.

### Step 2: the tool registry (0:50–1:10)

`lib/tools/index.ts` exports one registry:

```ts
export interface ToolDef<I extends z.ZodTypeAny> {
  name: string;                 // 'add_source'
  description: string;          // what the model reads. Short and exact
  input: I;                     // zod schema, includes runId and agent
  agents: AgentId[];            // who may call it (403-style 'unauthorized' otherwise)
  run(input: z.infer<I>, ctx: { now: Date }): Promise<unknown>;
}
export const tools: ToolDef<any>[] = [getRun, clockIn, status, think, addSource, setBusiness, addMenuItems,
  addCompetitor, checkPrices, reportReviewTheme, checkSite, reportListingIssue, draftFix, textOwner, done];
```

Then three thin adapters over the same registry:

1. **REST:** `app/api/agent/[tool]/route.ts`: token check, `tool.input.parse(body)`, `tool.run`, JSON out.
2. **MCP:** `app/api/[transport]/route.ts` with `createMcpHandler` from `mcp-handler` and `basePath: '/api'`, so the endpoint is `/api/mcp`. Register every tool with its zod shape; return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Wrap the handler so it rejects a missing or wrong token (header or `?token=`) with 401 before delegating. Test with the MCP Inspector (`npx @modelcontextprotocol/inspector`) against your Vercel preview.
3. **Function tools for the API crew:** `lib/crew/aiTools.ts` maps each def to an AI SDK `tool({ description, inputSchema, execute })`, pre-filling `runId` and `agent` so the model can't spoof them.

Tests: every tool rejects unknown fields; an agent calling a tool it isn't allowed returns `unauthorized`; REST and the registry give the same result.

### Step 3: lookup (1:10–1:25)

`POST /api/lookup { query }`: one Grok 4.7 call with `web_search` only and a strict JSON output (zod-parse it; on parse failure retry once with the error). Prompt: "Find the real business the user means. Return 1–5 candidates with name, street address, city, category, website if any, and the URL where you found each. Never invent a business. If unsure, return fewer." Under 10 s; cache by query for 10 minutes.

### Step 4: the shift and Rosa (1:25–1:50)

- `lib/crew/shift.ts`: the DAG from the spec. `startRun(runId)` → Rosa resolves; when Rosa calls `done` for the resolve phase, start Vic, June, Otto (and Lou if books are attached); when all of them are `done` or `failed`, start Fern; when Fern is `done`, Rosa texts and the run goes `awaiting_approval`. `done` from any agent calls `shift.next(runId)`. Idempotent: calling `next` twice never starts an agent twice (store a `phase` and `started` set on the run).
- `POST /api/runs`, `POST /api/runs/:id/start` (returns right away; the work runs in `after()`), `GET /api/runs/:id`, `GET /api/runs/:id/events`.
- Budgets: 150 s and 12 steps per agent on the API crew. On timeout: `agent.status { message: "Ran out of time; handing in what I found" }`, status `failed`, then `shift.next`.

### Step 5: the API crew (1:50–2:30)

`lib/crew/api.ts`, one function per agent run:

```ts
const result = await generateText({
  model: xai.responses(config.xaiModel),          // 'grok-4.7'
  system: prompts[agent],                          // from grokbot/BOTS.md: same words the Grok Bots get
  prompt: JSON.stringify({ runId, business: run.business, task: phase }),
  tools: { web_search: xai.tools.webSearch(), ...(agent === 'june' ? { x_search: xai.tools.xSearch() } : {}), ...aiTools(agent, runId) },
  stopWhen: stepCountIs(12),
  abortSignal: AbortSignal.timeout(150_000),
  onStepFinish: (step) => emitThinking(runId, agent, step),  // tool calls → agent.thinking, usage → run.usage
});
```

- `emitThinking` turns each tool call into a short line: `search: "cold brew price" near Valencia St`, `open: tidepoolcoffee.com/menu`, `add_competitor: Corner Cup`. Keep it under 120 characters. These are the thought bubbles; they are the best "it's real" proof on stage.
- Record usage from the response (`server_side_tool_usage_details`: web searches, X posts fetched) into `run.usage`.
- Run Vic, June and Otto with `Promise.allSettled`, each in its own `after()` call so one slow agent never blocks the others.
- First real run, end of step 5: pick a real café near the venue, run it, and save the run plus events to `data/runs/<slug>-<date>.json` with `scripts/record-run.ts`. Tell Nick. This is real data he can build against, and the labeled REPLAY fallback.

### Step 6: the engine (in parallel with step 5; tests first)

- `lib/engine/money.ts`: parse `"$4.50"` / `"4.5"` → cents, format cents → `"$4.50"`, round down to $0.25.
- `lib/engine/prices.ts`: the underpriced rules in the spec, section 9. Tests for every "must not flag" case.
- `lib/engine/sitecheck.ts`: fetch with a 4 s timeout, a browser User-Agent, robots.txt respected, ≤ 15 pages, link classification by path and host, status of every order/menu/booking link, hours from text and schema.org, viewport check. Unit-test the parsers on saved HTML in `tests/fixtures/sites/` (no network in tests).
- `lib/engine/listings.ts`: normalize hours / phone / address and compare.
- `lib/engine/reviews.ts`: validate mentions, severity by count and recency.
- `lib/engine/totals.ts` and `lib/engine/drafts.ts` (`$` figure extraction and the `bad_draft` check).

### Step 7: fixes and approvals (2:30–3:00)

- `draft_fix` with the 422 check; `approval.requested` once every open finding has a draft; fixes get `number` 1, 2, 3 in finding order (severity first).
- `POST /api/fixes/:id/approve` and `/reject`. Approving a `price_change` updates the item's price in `run.business.items`, sets `applied`, emits `fix.applied` (the tag flips). `review_reply` / `listing_update` / `site_fix` → `sent` with `sentVia: 'copy'`. Emails (books fixes) → Resend, allowlist only.
- Export `approveFix(fixId, via)` and `rejectFix` from `lib/fixes.ts`: the text commands in step 8 call the same functions.

### Step 8: texting, Rosa (by checkpoint 2; a first real text by checkpoint 1)

The feature that makes owners come back. Spec section 10 has the templates, commands and guardrails.

- `lib/text/send.ts`: `sendText(owner, body, { runId, kind })` with two adapters picked by `TEXT_CHANNEL`:
  - **Sendblue:** POST to their send-message endpoint with the `sb-api-key-id` and `sb-api-secret-key` headers, body with the owner's number and the text. Check field names in [their docs](https://docs.sendblue.com/llms.txt). Free plan: the owner must text the Sendblue number first; treat that first inbound text as verification.
  - **Telegram:** `POST https://api.telegram.org/bot<token>/sendMessage { chat_id, text }`. Register the webhook once with `setWebhook { url: PUBLIC_URL + '/api/text/telegram', secret_token }` and check the `X-Telegram-Bot-Api-Secret-Token` header on every inbound call. The owner links their chat by tapping `t.me/<bot>?start=<ownerId>`.
  - Guardrails before every send: number in `TEXT_ALLOWLIST`, not `stopped`, quiet hours (unless replying), at most 6 Rosa-initiated texts per run. Store every `TextMessage`, emit `text.sent`.
- `app/api/text/sendblue/route.ts` and `app/api/text/telegram/route.ts`: inbound → find the owner → store → emit `text.received` on their latest run → `commands.ts` → reply.
- `lib/text/commands.ts`: a pure parser, `parse(body) → { kind: 'yes'|'no'|'all'|'details'|'stop'|'start'|'units'|'scan'|'question', n?, … }`. Test it hard: `yes 2`, `Y2`, `2 yes`, `approve #2`, `YES` with no number (ask which), `stop`, emoji, extra spaces.
- `lib/text/rosa.ts`: free questions go to Grok 4.7 with read-only tools (`get_run`) and the run's sources; 2–3 sentences; never approves from free text, asks for `YES n` instead.
- `lib/text/templates.ts`: welcome, early alert, approval list (numbered like `fix.number`), confirm, brief. Every `$` figure comes from `facts` or `totals`.
- `/api/owner`, `/api/owner/:id`, `/api/owner/:id/texts` for Nick's setup page and phone mirror.
- `text_owner` tool calls `sendText`. Rosa's shift ends with the approval text; the first high-severity finding triggers the early alert (once per run).
- Test on a real phone through the deployed app before checkpoint 2. Then do the same over Telegram so the backup is proven.

### Step 9: harden the deploy (by checkpoint 2)

The first deploy happens at checkpoint 1 (Vercel builds `main` on every merge). This step makes it hold up on stage.

- `export const maxDuration = 300` on the start route and the agent runners. Check the limit for your Vercel plan in the dashboard.
- Per-run lock so `start` twice doesn't double-run. Rate limit `/api/lookup` and `/api/runs` per IP (simple Redis counter).
- `PUBLIC_URL` set, so tools and texts can build links.

### Step 10: the Grok Bot crew (3:00–4:30)

Full walkthrough in [`GROK_BOT.md`](GROK_BOT.md) part B. Your code side:

- `lib/crew/grokbot.ts`: `trigger(agent, run)` POSTs `GROKBOT_WEBHOOK_<AGENT>` with `Authorization: Bearer GROKBOT_KEY_<AGENT>` and body `{ runId, agent, phase, business, mcpUrl, instructions: "Use the afterhours-shift skill as <agent>" }`. 200 means the run *started*, not finished.
- `shift.ts` uses `grokbot.trigger` when `run.crew === 'grokbot'`, with a 6-minute watchdog per agent: if the Bot hasn't called `clock_in` within 90 s or `done` within 6 minutes, run that agent on the API crew and say so in an `agent.status`.
- `scripts/smoke-grokbot.ts`: checks every webhook env var is set, POSTs a `{ ping: true }` body to each (the skill tells Bots to reply via `status` "pong" and stop), and waits for the pongs through the event log.
- Get one Bot (Vic) working end to end first, then copy the setup to the others.

### Step 11: the judge's-pick drill (from 4:30)

`scripts/drill.ts` runs the API crew on a list of 10 real businesses of different kinds (café, taqueria, salon, bike shop, bakery, a business with no website, a chain location, one in another city). For each: time to finish, findings count, any agent failures, any 422s. Fix the top three failure causes. Run it again before judging. Send Rayyan the results for the Q&A prep.

### Step 12: the morning brief (P1, after the drill)

- Rosa's Grok Bot routine runs nightly on a schedule (GROK_BOT.md part B) and starts a run for each owner's business through `POST /api/runs` + `start` with `crew: 'grokbot'`. Vercel Cron (`/api/cron/brief`, every 15 minutes, `CRON_SECRET`) is the backup trigger with the API crew.
- `lib/text/brief.ts`: diff tonight's run against the previous run for the same business: competitor price changes, new or growing review themes, links that broke or got fixed, findings fixed since. Pick at most 3 lines and one decision.
- Send at the owner's `briefAt` local time. The text links to `/brief/<ownerId>` (Nick's page).
- For the demo, send a real brief a couple of hours before judging (set `briefAt` to that time) and show it with its real timestamp. Never backdate it.

### Step 13: the books scan (P1, only if everything above is solid)

- `POST /api/books` (multipart `runId`, `expenses`, `sales`, `catalog`), `lib/books/parse.ts` with papaparse.
- `lib/books/mapColumns.ts`: one Grok 4.7 call maps unknown CSV headers to ours (`date`, `payee`, `amount`, `reference`, `sku`, `quantity`, `unit_price`, `unit_cost`…); show the mapping in the response so the UI can confirm it.
- Lou's checks, the same rules Plumb had: duplicate payments (same payee, same amount to the cent, same reference or within 7 days); subscription creep (monthly in ≥ 4 of 6 months, latest ≥ 1.10 × the median of the first 3 and ≥ $5 more); margin erosion (unit cost up ≥ 10% and margin down ≥ 5 points). `basis: 'books'`.
- Units sold per item from `sales.csv` replace Vic's "20 a day" assumption (emit `finding.updated`).
- Only real exports. If none of us has a real business export we're comfortable showing, keep this off the stage and say it's next on the roadmap.

## Agent prompts

The words live in `grokbot/BOTS.md` so both crews get the same job description. The API crew loads them in `lib/crew/prompts.ts`. Rules every prompt includes:

1. Register a source with `add_source` **before** you use anything from it. Use the returned `sourceId`.
2. Report facts, never totals. Prices as integer cents. Never write a dollar estimate; the engine does that.
3. Only real, public pages. Never log in, never contact the business, never make anything up. If you can't find something, say so in `status` and move on.
4. Call `think` before each search or page you open (one short line), `status` with progress as you go, and `done` with a one-sentence summary at the end.
5. Stay inside your job and your time.

## Tests to have by checkpoint 2

`money`, `prices` (all must-not-flag cases), `drafts` (422 on a wrong figure, OK on exact facts), `listings` (hours normalize), `sitecheck` parsers on fixtures, `events` (gapless seq), `tools` (auth, unknown fields), `shift` (DAG order, idempotent `next`, timeout path) with a fake model. `npm test` with no keys and no network.

## Checklist before judging

- [ ] `/api/health` on the production URL: `xai: true`, `text` set, `grokbot.webhooks: 5`
- [ ] A judge's-pick run on the production URL finishes in under 3 minutes, at least 3 findings, every one with sources
- [ ] Rosa's approval text arrives on a real phone from production; `YES 1` flips the tag on screen; `why 2` gets a grounded answer
- [ ] Telegram backup tested end to end; switching is one env var and a redeploy
- [ ] `draft_fix` returns 422 on a wrong figure (show it if asked about "technical substance")
- [ ] The Grok Bot crew finished a full run tonight on a real business; it's in history
- [ ] A Grok Bot falling over hands its job to the API crew with a visible message
- [ ] Usage counts on screen match the xAI usage fields
- [ ] No keys in git (`git log -p | grep -i "xai-\|sk_"` is empty)
