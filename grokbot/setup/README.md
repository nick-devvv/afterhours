# Grok Bot crew setup

One file per Bot, generated from `grokbot/BOTS.md` and the `afterhours-shift` skill (`npm run sync-prompts`).

Order: **Vic first** (get one Bot working end to end), then Rosa, Otto, June, Fern.

1. Deploy the backend so `<PUBLIC_URL>/api/mcp` exists, with `AFTERHOURS_AGENT_TOKEN` and `XAI_API_KEY` set in Vercel.
2. For each Bot, follow `grokbot/setup/<name>.md`: create the Bot, paste the profile, save the skill, add the MCP server, create the webhook routine.
3. Put each routine's webhook URL and key in Vercel as `GROKBOT_WEBHOOK_<NAME>` / `GROKBOT_KEY_<NAME>`, redeploy.
4. `PUBLIC_URL=… AFTERHOURS_AGENT_TOKEN=… npm run smoke-grokbot`: every Bot should answer "pong".
5. Start a run with `crew: "grokbot"`. Any Bot that doesn't clock in within 90 s (or finish in 6 min) is replaced by the API crew, and the shop says so.

Dot (the file clerk) and Lou don't need Grok Bots: Dot runs inside `POST /api/books`.
