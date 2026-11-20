# Fern — chat history

Exported by Fern from Grok Bot, Nov 19 2026. The Afterhours bearer token is removed.

---

**Fern**

Hi Darian, I'm Fern! 🌿 Glad to be here. I'd love to hear what you'd like a hand with, so I can start being useful right away.

**Fern (question card)**

What would you like me to help with first?

- Email and messages
- Calendar and scheduling
- Research and reports
- Errands and bookings

**Darian**

Set yourself up for the Afterhours night crew. Do all three steps now, then reply "ready" with the routine's name.

1) These are your standing job instructions from now on. Remember them and follow them on every Afterhours job:

## Rules for every crew member

1. Register a source with `add_source` **before** you use anything from it. Use the `sourceId` it returns.
2. Report facts, never totals. Prices are integer cents (`$4.50` → `450`). Never write a dollar estimate; Afterhours' engine computes every figure.
3. Only real, public pages. Never log in, never contact the business or anyone at it, never make anything up. If you can't find something, say so with `status` and move on.
4. Before each search or page you open, call `think` with one short line ("search: cold brew price near Valencia St"). Call `status` with progress as you go. End with `done` and a one-sentence summary.
5. Stay inside your job. You have about 2 minutes on the API crew and 6 minutes as a Grok Bot.
6. Every tool call needs `runId` (from the webhook body or the task) and your `agent` id.

## Fern, fixer (`fern`)

You draft the fixes. `clock_in`, then `get_run`. For every finding without a fix, call `draft_fix` once:

- `underpriced`: title "Raise <item> from <ours> to <recommended>", using the finding's `facts` exactly.
- `review_theme`: a 2–3 sentence public reply to the most recent mention, warm and specific, in the owner's voice, plus the suggestion.
- `listing_mismatch`: the exact text to fix the listing that's wrong.
- `broken_link` / `missing_online`: what to fix on the site, in one or two sentences.

Use only figures that appear in the finding's `facts`; the API rejects anything else with 422 (read the error and try again). `done`.

2) Save the following as a skill named afterhours-shift, exactly as written (if a skill with that name already exists on this account, just make sure it's enabled for you): *(the `afterhours-shift` skill, see [`grokbot/skills/afterhours-shift/SKILL.md`](../../skills/afterhours-shift/SKILL.md))*

3) Create a routine named afterhours-fern with a webhook trigger. When it fires, read the JSON body. If the body has "ping": true, call the afterhours tool status with the runId from the body, agent "fern", message "pong", then stop. Otherwise use the afterhours-shift skill as agent "fern", for the runId in the body. Pass that runId and agent "fern" on every afterhours tool call, and finish with the afterhours done tool.

The afterhours MCP server will be connected in a moment (I'll send the URL and token separately). Don't call any tools yet.

**Fern**

On it. I'm saving the job instructions first, then I'll check the skill and set up the routine.

**Fern**

Ready. The routine is afterhours-fern.

I've saved the crew rules and my fixer job as standing instructions. The afterhours-shift skill was already on your account with the same text, so it's available to me as is. The routine fires on its webhook: a ping gets a "pong" status, and anything else runs my fixer shift for that runId, with a one-line summary landing here. You can copy its webhook URL and sender key from the Routines tab. I haven't touched any Afterhours tools yet and will wait for the connection.

**Darian**

Add this MCP server, named afterhours (remote HTTP / Streamable HTTP): https://afterhours-picky9.vercel.app/api/mcp with header Authorization: Bearer `<AFTERHOURS_AGENT_TOKEN>`

**Fern**

Adding the afterhours server now. Quick note: my routine is afterhours-fern, not afterhours-otto, so I'll wire it to that one.

**Fern**

I see 0 afterhours tools right now. The server is saved as afterhours with your bearer header, but it's answering with "authentication required", which fits the deploy still being fixed, so I left it in place.

The afterhours-fern routine doesn't need any extra wiring: it uses whatever connectors are on your account when it fires, so it'll pick up these tools once the server comes up. Ping me when the deploy is live and I'll recheck the tool count.

**Darian**

Correction: you're Fern. Use the afterhours MCP server with your afterhours-fern routine (not afterhours-otto). Agent id "fern" on every afterhours tool call.

**Fern**

Yes, that's how it's set up. afterhours-fern will use the afterhours server and pass agent "fern" on every call. The server is saved but still shows 0 tools while it asks for authentication, so I'll recheck once the deploy is live.

**Darian**

Update to your standing job instructions. Add these to your list of finding types, so you can draft fixes for the bookkeeper's findings too:

- `duplicate_payment`: a short, polite refund request to the payee (in body), using the amount and dates from `facts`.
- `subscription_creep`: what to check or downgrade, in one or two sentences.
- `margin_erosion`: one practical option (raise the price, change supplier, smaller portion), with no new dollar figures.

Everything else stays the same: use only figures that appear in the finding's `facts`. Reply "updated" when saved.

**Fern**

Adding those three finding types to my job instructions and the routine now.

**Fern**

Updated. My standing instructions and the afterhours-fern routine now cover duplicate_payment, subscription_creep, and margin_erosion, and I'll still use only figures from each finding's facts.

**Automation 'afterhours-fern' completed**

Ping webhook for run_64940b3d393c: sent status "pong" as fern; Afterhours returned ok.

**Automation 'afterhours-fern' completed**

Philz Coffee (run_84b80e6b9bd2): drafted a fix for the one finding without one, a public reply to the long line / slow wait reviews plus the morning-rush pickup suggestion, then clocked out with done.

**Darian**

Export this entire conversation, every message from both of us, word for word and in order, as a Markdown file named `<your name>-chat-history.md`.

**Fern**

On it, building the Markdown export now and I'll upload it to Drive.
