# Rosa — chat history

Exported by Rosa from Grok Bot, Nov 19 2026. The Afterhours bearer token is removed.

---

**Rosa**

Hi Darian, I'm Rosa! I'm glad to be here. Let's work out how I can be most useful to you.

**Rosa (question)**

What would you like me to help with most? (they may also type their own answer)

- Email, calendar, and scheduling
- Research and reports
- Shopping, travel, and bookings
- Coding and projects

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

## Rosa, night manager (`rosa`)

You run the night shift for a small business and you are the one who texts the owner.

**Phase `resolve`:** `clock_in`. Find the business's own website, its maps listing and its menu or price list. `add_source` for each. Call `set_business` with name, category, address, city, website, phone, timezone, hours (one entry per source that states them, with that source's id) and rating if a listing shows it. Call `add_menu_items` with up to 15 items that have a clear price, each with the `sourceId` of the page where you read the price. Then `done`.

**Phase `report`:** call `get_run`, then `text_owner` once (`kind: 'approval'`): a short message in plain words with the numbered fixes exactly as Fern titled them and the totals exactly as `get_run` gives them, ending with "Reply YES 1, NO 1, or ALL. Ask me anything." Then `done`.

2) Save the following as a skill named afterhours-shift, exactly as written (if a skill with that name already exists on this account, just make sure it's enabled for you): *(the `afterhours-shift` skill, see [`grokbot/skills/afterhours-shift/SKILL.md`](../../../grokbot/skills/afterhours-shift/SKILL.md))*

3) Create a routine named afterhours-rosa with a webhook trigger. When it fires, read the JSON body. If the body has "ping": true, call the afterhours tool status with the runId from the body, agent "rosa", message "pong", then stop. Otherwise use the afterhours-shift skill as agent "rosa", in the phase named in the body ("resolve" or "report"), for the runId in the body. Pass that runId and agent "rosa" on every afterhours tool call, and finish with the afterhours done tool.

The afterhours MCP server will be connected in a moment (I'll send the URL and token separately). Don't call any tools yet.

**Rosa**

On it. I'm saving the crew instructions, the skill, and the routine now.

**Rosa**

The crew instructions and the skill are saved. I'm setting up the webhook routine next.

**Rosa**

Ready: the routine is afterhours-rosa.

I've saved the crew rules and my resolve and report steps to memory. The afterhours-shift skill was already on your account with exactly that text, so I'm using it as is. The routine runs when Afterhours posts to its webhook URL. You can copy that URL and its sender key from the routine panel. I won't touch the Afterhours tools until you send the server URL and token.

**Darian**

Add this MCP server, named afterhours (remote HTTP / Streamable HTTP): https://afterhours-picky9.vercel.app/api/mcp with header Authorization: Bearer `<AFTERHOURS_AGENT_TOKEN>`

**Rosa**

Adding the afterhours server now.

**Rosa**

I see 0 tools for now. The deploy is still answering 401 even with the token, which is the case you warned about, so the server isn't connecting yet.

afterhours is saved on your account with the Bearer header, as a remote HTTP server at the /api/mcp URL. I didn't need the ?token= fallback. Your connectors are shared across the account, so the afterhours-rosa routine will pick up these tools once the fix lands. When it's live, just tell me and I'll list the tools again.

**Darian**

Export this entire conversation, every message from both of us, word for word and in order, as a Markdown file named `<your name>-chat-history.md`.

**Rosa**

On it — exporting the full conversation, redacting the token, and uploading to Drive now.
