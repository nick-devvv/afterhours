# Vic — chat history

Copied from the Grok Bot app, Nov 19 2026. The Afterhours bearer token is replaced with `<AFTERHOURS_AGENT_TOKEN>`.

---

**Vic**

Hey Darian, I'm Vic! 👋 Happy to be here. Let's figure out how I can be most useful to you.

**Vic (question card)**

What would you like me to help with most? Choose all that apply.

- Work tasks and research
- Email, calendar, and scheduling
- Shopping, travel, and errands
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

## Vic, price checker (`vic`)

You walk the street and compare prices.

`clock_in`, then `get_run` for the business and its items. Find 2–4 competitors of the same kind within about a mile that publish prices (their own menu page first, then a delivery app or maps menu). For each: `add_source` for the page with the prices, then `add_competitor` with their items. Set `matchesItemId` only when the item is the same kind **and** size as one of ours (a 16 oz cold brew matches a 16 oz cold brew, not a 12 oz latte). Then call `check_prices` once. `done` with how many competitors and matched items you found.

2) Save the following as a skill named afterhours-shift, exactly as written: *(the `afterhours-shift` skill, see [`grokbot/skills/afterhours-shift/SKILL.md`](../../../grokbot/skills/afterhours-shift/SKILL.md))*

3) Create a routine named afterhours-vic with a webhook trigger. When it fires, read the JSON body. If the body has "ping": true, call the afterhours tool status with the runId from the body, agent "vic", message "pong", then stop. Otherwise use the afterhours-shift skill as agent "vic", for the runId in the body. Pass that runId and agent "vic" on every afterhours tool call, and finish with the afterhours done tool.

The afterhours MCP server will be connected in a moment (I'll send the URL and token separately). Don't call any tools yet.

**Vic**

On it. I'll save the instructions, the skill, and the routine now.

**Vic**

ready: afterhours-vic

I've saved the crew rules and my price-checker job to memory, along with the afterhours-shift skill exactly as written. The routine runs on its webhook and answers a ping with "pong". You can copy its webhook URL and key from the routine panel, and I haven't touched the afterhours tools yet.

**Darian**

Add this MCP server, named afterhours (remote HTTP / Streamable HTTP): https://afterhours-picky9.vercel.app/api/mcp with header Authorization: Bearer `<AFTERHOURS_AGENT_TOKEN>`
If you can't set a header, use https://afterhours-picky9.vercel.app/api/mcp?token=`<AFTERHOURS_AGENT_TOKEN>` instead. Make sure your afterhours-vic routine can use it. Then list the afterhours tools, but don't call any. If it can't connect yet (a login page or 401), keep the server saved anyway: the deploy is being fixed in the next few minutes. Reply with how many tools you see.

**Vic**

Adding the afterhours server now.

> *(connector card)* afterhours · Connected · 1 Account. Grok Bot always asks before making changes. Disconnect at any time.

**Vic**

The afterhours server is saved with the bearer header, but it isn't connecting yet (it's asking for auth), so I see 0 tools for now. My afterhours-vic routine uses the same connection, so it'll pick the tools up once the deploy is fixed.

**Darian**

The deploy is fixed, but at a different address. Update the afterhours MCP server (the shared connector on this account) to use this URL instead: https://afterhours-chi-six.vercel.app/api/mcp with the same header Authorization: Bearer `<AFTERHOURS_AGENT_TOKEN>` (if you need the query form: https://afterhours-chi-six.vercel.app/api/mcp?token=`<AFTERHOURS_AGENT_TOKEN>`). Remove or replace the old afterhours-picky9 address. Then list the afterhours tools (don't call any) and reply with how many you see. There should be 16.

**Vic**

Switching afterhours to the new address now.

**Vic**

16 tools. The afterhours connector now points to the afterhours-chi-six address with the same bearer header, and it's connected. I updated the existing connector in place, so the old afterhours-picky9 address is gone. My afterhours-vic routine uses this same connector, so it doesn't need any changes. I haven't called any of the tools.

**Routine afterhours-vic**

I finished the Philz Coffee shift. I found two nearby competitors with published prices, Sweet Maple and Verve Coffee Roasters, but none of their items matched ours on both kind and size, so there were no price findings.
