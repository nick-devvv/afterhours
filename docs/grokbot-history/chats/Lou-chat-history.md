# Lou — chat history

Copied from the Grok Bot app, Nov 19 2026. The Afterhours bearer token is replaced with `<AFTERHOURS_AGENT_TOKEN>`.

---

**Lou**

Hi Darian, I'm Lou! Glad to be here and ready to take some work off your plate.

**Lou (question card)**

What would you like me to help with most?

- Email and messages
- Calendar and scheduling
- Research and reports
- Shopping, travel, and errands
- Coding and projects

**Darian**

Set yourself up for the Afterhours night crew. Do all four steps now, then reply "ready" with the routine's name.

1) These are your standing job instructions from now on. Remember them and follow them on every Afterhours job:

## Rules for every crew member

1. Register a source with `add_source` **before** you use anything from it. Use the `sourceId` it returns.
2. Report facts, never totals. Prices are integer cents (`$4.50` → `450`). Never write a dollar estimate; Afterhours' engine computes every figure.
3. Only real, public pages. Never log in, never contact the business or anyone at it, never make anything up. If you can't find something, say so with `status` and move on.
4. Before each search or page you open, call `think` with one short line. Call `status` with progress as you go. End with `done` and a one-sentence summary.
5. Stay inside your job. You have about 2 minutes on the API crew and 6 minutes as a Grok Bot.
6. Every tool call needs `runId` (from the webhook body or the task) and your `agent` id.

## Lou, bookkeeper (`lou`)

You read the owner's own books. Only when the owner uploaded exports (Dot, the file clerk, has already sorted them into expenses, sales and catalog). `clock_in`, then `scan_books` with `duplicates`, `subscriptions` and `margins`, one call each. The engine creates the findings; you never compute or type a dollar figure. `done` with how many findings you got.

2) Use the afterhours-shift skill that's already saved on this account (Vic saved it). Make sure it's enabled for you.

3) Create a routine named afterhours-lou with a webhook trigger. When it fires, read the JSON body. If the body has "ping": true, call the afterhours tool status with the runId from the body, agent "lou", message "pong", then stop. Otherwise use the afterhours-shift skill as agent "lou", for the runId in the body. Pass that runId and agent "lou" on every afterhours tool call, and finish with the afterhours done tool.

4) The afterhours MCP server is already connected on this account (https://afterhours-picky9.vercel.app/api/mcp, Bearer token). Make sure you and your routine can use it. If you need to add it: header Authorization: Bearer `<AFTERHOURS_AGENT_TOKEN>`. It may show 0 tools until the deploy is fixed in a few minutes; that's fine. Don't call any tools yet.

**Lou**

On it, setting up for the Afterhours night crew now.

**Lou**

I've saved the crew rules and my bookkeeper job, and the afterhours-lou webhook routine is created. The afterhours connector is installed but still needs authentication, so I'm sorting that out next.

**Lou**

Ready, the routine is afterhours-lou.

I've saved the crew rules and my bookkeeper job to memory, and the afterhours-shift skill is available to me. The routine runs on a webhook: it answers a ping with "pong", and otherwise it works the shift as lou for the runId in the body and finishes with done. You can copy its webhook URL and sender key from the routine panel.

There's one open issue. The afterhours connector is installed, but right now the server turns away every request with a 401 that says "Protected by Vercel Authentication". The Bearer token isn't the problem. Vercel's deployment protection is in front of the whole site. Once that's turned off or the deploy is fixed, tell me and I'll reconnect it. I haven't called any of its tools.

**Darian**

Export this entire conversation, every message from both of us, word for word and in order, as a Markdown file named `<your name>-chat-history.md`. Replace the bearer token with `<AFTERHOURS_AGENT_TOKEN>` wherever it appears. Upload it to Google Drive in a folder named "Afterhours - Grok Bot chat histories" (create the folder if it doesn't exist; if it does, add to it). Reply with the file's Drive link.

**Lou**

On it. I'll write the transcript first, then connect Google Drive so I can upload it.

> *(connector card)* Google Drive · Connected · 1 Account. Grok Bot always asks before making changes. Disconnect at any time.

**Lou**

The transcript is ready, with the token replaced. Connect Google Drive and I'll upload it.
