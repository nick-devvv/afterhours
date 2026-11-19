# `app/_shop`: the 3D shop and where its events come from

The pages render the design canvas's artboards as they are (`app/_ui/designs/*.dc.html`, through `app/_ui/dc.tsx`).
The artboard mounts this engine and reads its snapshots; nothing in the UI is drawn by hand twice.

```
engine/   three.js: world (shop + block), traffic, workers, effects, sound, and the director (shop.ts)
crew/     where PlumbEvents come from: api | replay   (both speak lib/types.ts)
```

`layout.ts` holds the floor plan in its original coordinates and stretches it: X()/Z() make the building 1.25x
roomier and push the streets out with it. Anything placed in the world goes through them.

`traffic.ts` runs the street. Cars keep right, keep their distance, stop at the four signals, don't pull into a
junction they can't clear, and yield at the crosswalk out front (agents wait at the curb until cars have stopped)
and where the delivery truck crosses out of the alley. `npx tsx app/_shop/engine/traffic.check.ts` simulates 30 minutes
(150 crossings, the truck back and forth) and fails on any collision or a car stuck longer than one red light.

The director (`shop.ts`) doesn't play events the moment they arrive. They wait in an inbox and play one beat at a
time, each held long enough to read its caption (`hold()`), on real time scaled by the 1x/2x/4x buttons, so a fast
mock run and a slow live ClawMax run look the same. Nothing new starts while Penny's money call rings or is live.
The owner's decisions never wait: approve or skip catches the story up at once. Pause (the toolbar button or Space)
freezes agents, events, traffic and effects; the camera still moves. Room labels show only where something is
happening, where a leak is open, or under the pointer. The shop opens in night mode.

Nothing here computes money. Findings and fixes arrive in events; the counter uses `computeTotals` from
`lib/engine/totals` (client safe, like `lib/replay`). Nothing imports `lib/events` or calls `/api/agent/*`.

## How it plugs into Advik's API

The director only listens to `PlumbEvent`s (`lib/types.ts`). The API crew (`crew/api.ts`) does exactly what
`docs/MVP_SPEC.md` → API contract says:

| When | Call |
| --- | --- |
| Page load | `GET /api/health` → the pill says `MOCK CREW · via the API` or `ClawMax crew · live` |
| Start the shift | `POST /api/runs { sample: "fogline" }`, then `POST /api/runs/:id/start`. `triggered: "manual"` shows an amber note: click Run on `shift-kickoff` in ClawMax |
| While the run is live | `GET /api/runs/:id/events?after=N` every 700 ms (3 s after `run.finished`). It starts at `after=0` and never seeds from the snapshot, so nothing is counted twice |
| Approve / Skip on the desk | `POST /api/fixes/:id/approve` / `reject`. The card shows "Sending your answer…" until `fix.approved` / `fix.rejected` arrives |

Events the shop animates, and what it reads from them:

Rooms, as `docs/API.md` says: workers walk to the event's `room` (or `agent.moved`'s `data.to`); leak markers use `finding.room`.

| Event | Reads | What happens |
| --- | --- | --- |
| `run.created` | `data.shop` | name, counts, product names for price tags |
| `run.started` | | lights up, "Shift started" |
| `agent.clocked_in` | `agent` | walks in the front door, punches the clock |
| `agent.moved` | `agent`, `data.to` (or `room`) | walks there. `dock → loading_dock` brings the truck; `felix → vault` carries the folders |
| `agent.status` | `agent`, `data.message`, `data.progress` | badge line and progress bar. `progress: 100` = done, then a coffee break |
| `intake.done` | `data.counts` | stock fills the shelves and servers |
| `finding.created` | `data.finding` (a full `Finding`) | pipe cracks, coins drip, counter goes up. The first one makes Penny call |
| `fix.drafted` | `data.fix` (a full `Fix`) | Felix drafts it |
| `approval.requested` | `data.next` (optional) | the desk opens; Penny calls if anything is left to decide |
| `fix.approved` / `fix.rejected` | `data.fixId` | stamp. Price change: Scout walks to the shelf. Email: Felix gets ready |
| `fix.applied` | `data.fixId`, `data.sku`, `data.toCents` | the tag flips, the leak is patched, coins fly to the safe |
| `fix.sent` | `data.fixId`, `data.via` | the envelope flies to the mailbox, the leak is patched |
| `fix.failed` | `data.fixId`, `data.error` | the card turns red with the error |
| `agent.clocked_out` | `agent` | lines up on the shop floor |
| `run.finished` | | waits for everyone to arrive, then the team photo and confetti |
| `error` | `data.message` | red toast |

The UI never computes a finding or a fix. It sums the `firstYearCents` it was given for the counter.

### Optional extras the UI already knows how to show

`Finding.proof` and `Finding.rule` aren't in the contract. Without them the proof panel builds its tables and
bars from what every finding already has: `evidence[]` (rows, amounts, dates) and `facts` (the formatted
figures). With them it can draw more (see `crew/types.ts` → `Proof`). See `docs/DECISIONS.md`.

## Settings (`NEXT_PUBLIC_*`, read at build time)

| Setting | Default | |
| --- | --- | --- |
| `NEXT_PUBLIC_CREW` | `auto` | `api`, `replay` or `auto` (the API if `/api/health` answers, else the recorded run) |
| `NEXT_PUBLIC_API_BASE` | `''` | same origin. Set it to point the UI at another server |
| `NEXT_PUBLIC_REPLAY` | `0` | `1` replays `data/demo/recorded-run.json` (bundled, no API) up to the desk; your approvals play out locally |

## The design canvas

The canvas can't make network calls, so it replays the bundled recorded run (Advik's real mock shift) from a bundle of this folder:

```
npx esbuild app/_shop/engine/index.ts --bundle --format=iife --minify --target=es2020 --outfile=/tmp/plumb-shop.js
```

Upload that as an asset on the canvas and point both artboards' second `<head>` script at it. When the design
changes on the canvas, copy the `.dc.html` files back into `app/_ui/designs/`.
