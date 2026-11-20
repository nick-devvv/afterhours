# June — chat history

Copied from the Grok Bot app, Nov 19 2026. The Afterhours bearer token is replaced with `<AFTERHOURS_AGENT_TOKEN>`.

---

**June (question card)**

What would you like me to help with first?

- Email and messages
- Calendar and scheduling
- Research and writing
- Errands and shopping

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

## June, listener (`june`)

You hear what customers say.

`clock_in`. Read the business's recent reviews (maps listing, Yelp or similar public pages) and search X for posts about it. Group complaints into themes (slow line, wrong order, rude service, price, cleanliness, hours, parking…). For each theme with at least 2 mentions from at least 2 different sources: `add_source` for each page or post, then `report_review_theme` with the exact short quotes (under 200 characters), dates and stars when shown, and one practical suggestion. Praise is not a theme. `done`.

2) Save the following as a skill named afterhours-shift, exactly as written (if a skill with that name already exists on this account, just make sure it's enabled for you): *(the `afterhours-shift` skill, see [`grokbot/skills/afterhours-shift/SKILL.md`](../../../grokbot/skills/afterhours-shift/SKILL.md))*

3) Create a routine named afterhours-june with a webhook trigger. When it fires, read the JSON body. If the body has "ping": true, call the afterhours tool status with the runId from the body, agent "june", message "pong", then stop. Otherwise use the afterhours-shift skill as agent "june", for the runId in the body. Pass that runId and agent "june" on every afterhours tool call, and finish with the afterhours done tool.

The afterhours MCP server will be connected in a moment (I'll send the URL and token separately). Don't call any tools yet.

**June**

On it, setting up my Afterhours instructions, the skill, and the routine now.

**June**

ready: afterhours-june

I've saved my listener job and the crew rules, and the afterhours-shift skill was already on your account and is turned on for me. The routine runs whenever its webhook gets a call. You can copy its URL and sender key from the routine panel once the afterhours connector is hooked up.

**Darian**

Add this MCP server, named afterhours (remote HTTP / Streamable HTTP): https://afterhours-picky9.vercel.app/api/mcp with header Authorization: Bearer `<AFTERHOURS_AGENT_TOKEN>`
If you can't set a header, use https://afterhours-picky9.vercel.app/api/mcp?token=`<AFTERHOURS_AGENT_TOKEN>` instead. Make sure your afterhours-june routine can use it. Then list the afterhours tools, but don't call any. If it can't connect yet (a login page or 401), keep the server saved anyway: the deploy is being fixed in the next few minutes. Reply with how many tools you see.

**June**

Adding the afterhours server now.

**June**

I see 0 tools for now. The afterhours server is saved with your bearer header, but the endpoint returns a 401 even with the token, so it shows as waiting for sign-in. That matches the deploy issue you mentioned. My afterhours-june routine uses the same account connectors, so it'll pick up the tools as soon as the server accepts the token. Ping me once the fix is live and I'll check the tool list again.

**Darian**

Export this entire conversation, every message from both of us, word for word and in order, as a Markdown file named `<your name>-chat-history.md`. Replace the bearer token with `<AFTERHOURS_AGENT_TOKEN>` wherever it appears. Upload it to Google Drive in a folder named "Afterhours - Grok Bot chat histories" (create the folder if it doesn't exist; if it does, add to it). Reply with the file's Drive link.

**June**

Exporting this chat to Markdown and uploading it to Drive.

> *(connector card)* Google Drive · Connected · 1 Account. Grok Bot always asks before making changes. Disconnect at any time.

**June**

I've written june-chat-history.md with our messages in order and the bearer token swapped for `<AFTERHOURS_AGENT_TOKEN>`. Google Drive is installed but needs a quick connect — finish the card that just came up and I'll create the "Afterhours - Grok Bot chat histories" folder and upload the file.

**June**

Google Drive is connected. Creating the folder and uploading the chat history now.

**June**

Uploaded. Here's june-chat-history.md in Afterhours - Grok Bot chat histories. The bearer token is redacted as `<AFTERHOURS_AGENT_TOKEN>`.
