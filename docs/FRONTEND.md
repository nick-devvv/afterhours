# Frontend and UI: Nick

Branch: `nick/frontend`. You own `app/` (except `app/api/`), `public/`, design and the README. **Due 4:45 PM**: follow the time plan in [`MVP_SPEC.md`](MVP_SPEC.md) section 13. Your Bot: have it do the mechanical porting and screenshot the deployed app after every merge.

## Step 0 (3:05–3:25): bring over Plumb's shell and 3D shop, merge first

```bash
git clone -b nick/frontend --depth 1 https://github.com/nick-devvv/plumb /tmp/plumb
cd afterhours && git checkout nick/frontend
cp /tmp/plumb/{package.json,package-lock.json,next.config.ts,tsconfig.json,eslint.config.mjs,vitest.config.mts} .
mkdir -p app && cp -r /tmp/plumb/app/{_shop,_ui,layout.tsx,globals.css,favicon.ico} app/
```

- `package.json`: rename to `afterhours`; drop the Plumb scripts (`make-sample`, `mock-*`, `smoke-clawmax`, `record`).
- Types: `PlumbEvent` → `AfterhoursEvent`, imports from `@/lib/types` (Darian's contract is already on `main`).
- Agents, same sprites and homes: Penny → **Rosa** (front_desk), Scout → **Vic** (street → shop_floor), Sid → **Otto** (server_closet), Dock → **June** (shop_floor), Audrey → **Lou** (back_office), Felix → **Fern** (mailroom).
- Delete the Fogline replay crew and anything that imports `lib/replay`, `lib/engine/*` or `data/demo`. The counter reads `run.totals` from the API; the UI never computes money.
- `npm run build` passes → PR to `main` → tell Darian.

## Step 1 (3:25–3:50): landing, lookup, and the shop on real data

- **`/` landing:** the night shop behind one input: "Name any business". Debounced `POST /api/lookup` on submit → candidate cards (name, address, category, source domain) → pick → `POST /api/runs` → `POST /api/runs/:id/start` → go to `/run/<id>`. Empty result: "Add the city or street."
- **`/run/[id]`:** the shop, driven only by events (`GET /api/runs/:id/events?after=N` every 700 ms; `GET /api/runs/:id` once on load).
- **The world is the business** (this is what makes it look finished):
  - `business.resolved` → the sign repaints with the real name; shelves fill with the real items and price tags (up to 12); the door shows the hours; the clock and day/night follow `business.timezone`.
  - `competitor.found` → a storefront across the street lights up with the competitor's name and floating price tags for matched items.
- Until Darian's first real run lands, build against a dev fixture in `tests/fixtures/dev-events.json`. It never ships to the live app. After 3:50 use his recorded real run in `data/runs/`.

## Step 2 (3:50–4:15): the parts judges will click

1. **Proof panel** ("Show me the proof" on every finding): sources with title, domain, quote, date read, and our `httpStatus` badge; for `underpriced`, a bar row per competitor vs ours vs median vs recommended; for `review_theme`, the quotes with stars and dates; for `broken_link`, the link and status. Assumptions in plain words under an "Estimate" label.
2. **Owner's desk:** fix cards numbered like the texts (`1`, `2`, `3`), Approve / Skip (`POST /api/fixes/:id/approve` / `reject`), Copy for review replies and listing text. A text approval (`fix.approved` with `via: 'text'`) stamps the card too.
3. **Phone mirror:** right rail, chat bubbles from `text.sent` / `text.received` (and `GET /api/owner/:id/texts` on load), typing dots for 600 ms before an outbound bubble. Rosa lifts her phone in the scene on `text.sent`.
4. **Counter:** "≈ $X/mo found · estimate" and "$Y fixed" from `run.totals`; never a hard-coded number.
5. **Crew chip:** `GROK API CREW` or `GROK BOT CREW` from `run.crew`; a small usage meter from `run.usage` (searches, X posts, pages checked).
6. **Owner setup** (`/owner`): name + channel → `POST /api/owner` → "Tap to connect on Telegram" link (or "Text HI to …") → poll `GET /api/owner/:id` until verified.

## Step 3 (4:15–4:35): polish, in this order

1. Thought bubbles from `agent.thinking` (2.5 s each), sources flying as paper cards into the case file on the front desk.
2. Camera cuts to the room where each event happens; drips scale with impact; the price tag flips on `fix.applied`.
3. States: lookup loading and empty, an agent `failed` ("Vic ran out of time; here's what he found"), API error toast, run finished.
4. For the 2D pages your hackathon-ui-playbook look (warm paper, halftone, bold motion) works well against the night shop.

## Checklist before 4:45

- [ ] A judge's pick on the production URL plays from lookup to texts with no console errors
- [ ] Every number on screen comes from the API; estimates say "estimate"
- [ ] Every finding opens its proof with working links
- [ ] Nothing on screen says Plumb, Fogline, ClawMax, "mock" or "sample"
- [ ] Mobile view of `/owner` and the phone mirror look right
- [ ] README: pitch, live link, screenshot, "Built with Grok Bot", "3D engine started in our Plumb project"
