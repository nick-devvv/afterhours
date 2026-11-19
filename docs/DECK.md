# The pitch deck and demo: Rayyan

Branch: `rayyan/deck`. You own `deck/` and `docs/BUILD_LOG.md`. No app code. **Due 4:45 PM.** Build the deck with your Grok Bot (xAI's prebuilt "Pitch Deck Coach" Bot is a good start): give it `docs/MVP_SPEC.md` sections 1, 2 and 15 and this file.

## Timeline

| Time | Do |
| --- | --- |
| 3:05–3:50 | Deck v1, slides 1–8 below, with placeholders only for screenshots. Post it in the team chat at 3:50 |
| 3:50–4:15 | Real screenshots from the production app (ask Nick for the URL). Fill the "Built with Grok Bot" slide from BUILD_LOG. Q&A prep |
| 4:15–4:35 | Rehearse the demo script (spec section 15) with Nick, timed. Record a backup screen video of one full run on production |
| 4:35–4:45 | Export PDF to `deck/afterhours.pdf`, submit, final run-through |

## Slides (keep each to one idea and a few words)

1. **Afterhours.** "You close at 6. Your crew starts at 6:01." The night shop screenshot.
2. **The problem.** Small businesses leak money where nobody looks: prices under the street, broken order links, the same complaint in four reviews. One or two real statistics about small-business owners' time or margins, **each with its source in small type**. Your Bot finds them; check every number against its source. No source, no number.
3. **Maya.** The persona from spec section 1: owns a café, lives on her phone, never opens reports. Her one-line job: "Tell me where I'm losing money and what to do, by text."
4. **Live: name any business.** One line. Switch to the app here.
5. **How it works.** The crew (Rosa, Vic, June, Otto, Fern) and the diagram: Grok Bots and the xAI API crew, one set of tools, code computes every dollar, sources on every claim.
6. **Why owners come back.** Rosa's morning text (a real one from the app, with its real timestamp). One decision per text, answered by reply.
7. **Built with Grok Bot.** Two halves: we built it with our Bots today (numbers from BUILD_LOG: commits, PRs, deck), and the crew itself runs as Grok Bots on routines with webhooks and MCP.
8. **What's next.** Nightly watch list, the books scan (Square / Stripe / QuickBooks), review replies through Google Business Profile, voice. A price: a free first scan, then a monthly plan per location (say it's our plan, not validated).
9. **Team.** Nick, Darian, Rayyan, and our three Bots by name.

## BUILD_LOG.md (our proof for "Built with Grok Bot")

Every 30 minutes, ask Nick and Darian (or read the PRs) and add lines: time, who, which Bot, what it did, a link (PR, commit or screenshot). Screenshot Darian's Grok Bot app showing the crew Bots and their routines if he gets them running.

## Q&A prep (have one-line answers ready)

| Likely question | Answer |
| --- | --- |
| Is the data real? | Yes. Every finding links to the page it came from; our server checked the links itself. Click any proof |
| Where do the dollar figures come from? | Code, not the model. Price gaps from real menus × an assumed daily volume that's shown on screen and the owner can change by text. The API rejects a draft with a figure that isn't in the facts |
| What if the business has no website? | That's a finding. The crew still uses maps and delivery-app menus |
| Why texts? | Owners don't open dashboards; they answer texts. One decision per text |
| Why Grok Bots and not just an API call? | Bots have a browser and a cloud computer, run on a schedule every night, and can be triggered by our webhooks. The API crew is the fast path for live demos; both use the same tools |
| Did you contact the business? | Never. Texts and emails only go to our own allowlisted numbers |
| What did Grok Bot do in the build? | Point at the BUILD_LOG slide |
| What's built vs planned? | Built: everything in the demo. Planned: what's on the "next" slide |

Fill the drill results from Darian (which businesses worked, how long a run takes) into the answers before 4:30.
