# Grok Bot: how we build with it, and how the crew runs on it

"Built with Grok Bot" is judged as "the best example of going from idea to working product with Grok Bot". We show it two ways.

## Part A: building with our Bots (everyone, from now)

1. **One Bot each.** Nick's Bot ports the 3D shop and screenshots the production app after every merge to catch visual bugs. Darian's Bot writes backend steps and their tests, one step per PR. Rayyan's Bot builds the deck and researches sourced statistics.
2. **Give every Bot the same context first:** `AGENTS.md`, `docs/MVP_SPEC.md` and your own task file. Then hand it one step at a time.
3. **GitHub:** let your Bot clone the repo on its cloud computer and push to your branch only (a fine-grained token in the Bot's secret card, scoped to `nick-devvv/afterhours`). PRs into `main` are opened by people.
4. **A team group chat** with the three of us and our Bots, for "merged X", "deploy is up", "contract changed".
5. **Log it** in `docs/BUILD_LOG.md`. Rayyan turns it into the deck slide.

## Part B: the Grok Bot crew (Darian, stretch after 4:15; Vic first)

The crew Bots live on Darian's Grok Bot account. Bots on one account share one cloud computer, so give each Bot one job.

### 1. Make Vic (then the others the same way)

- Create a Bot named **Vic**. In its profile instructions paste "Rules for every crew member" and "Vic" from [`grokbot/BOTS.md`](../grokbot/BOTS.md).
- Add the skill: in Vic's chat, paste [`grokbot/skills/afterhours-shift/SKILL.md`](../grokbot/skills/afterhours-shift/SKILL.md) and ask "Save this as a skill named afterhours-shift". Enable it for Vic under Connect apps → Private skills if it doesn't show in the `/` menu.

### 2. Connect our MCP server

In Vic's chat: "Add this MCP server: `https://<production-url>/api/mcp` with header `Authorization: Bearer <AFTERHOURS_AGENT_TOKEN>`." If it can't set a header, use `https://<production-url>/api/mcp?token=<AFTERHOURS_AGENT_TOKEN>`. Then: "Use the afterhours MCP to call get_run with runId <a real run id> and agent vic" to check the tools load. Grok Bot only supports remote HTTP MCP, which is what `/api/mcp` is.

### 3. Give Vic a routine with a webhook

In Vic's chat: "Create a routine named afterhours-vic with a webhook trigger. When it fires, read the JSON body. If it has `ping: true`, call the afterhours `status` tool with message 'pong' and stop. Otherwise use the afterhours-shift skill as the agent named in the body, for the runId in the body." Open the routine on desktop → **Webhook** section → copy the URL and key into Vercel as `GROKBOT_WEBHOOK_VIC` and `GROKBOT_KEY_VIC`. Press **Test** once.

A webhook call is an HTTP POST with `Authorization: Bearer <key>` and our JSON body. A 200 means the run started, not that it finished. Only new events count.

### 4. Run it

- `npm run smoke-grokbot` (pings each Bot; waits for "pong").
- Start a run with `crew: 'grokbot'`. Watch Vic's chat and the shop at the same time. If Vic hasn't clocked in within 90 s or finished within 6 minutes, the API crew takes his job and the shop says so.
- Repeat for Rosa, June, Otto and Fern. Rosa's routine also gets a schedule ("every day at 2:00 AM") for the nightly shift (P1).

### Limits to respect (from the Grok Bot docs)

- Schedules at least 5 minutes apart; up to 50 routines per Bot; routines rate-limited per hour; every run spends your weekly usage. Rehearse with the API crew, not the Bots.
- A test run does real work.
- If a Bot pauses to ask approval for our MCP tools, allow the afterhours server for that Bot. Our server already blocks anything risky (allowlists, no third-party contact).
- Bots on one account share logins and files. Don't put personal logins on Darian's Bot computer.

## Part C: what we show the judges

- The deck slide: our Bots' work from BUILD_LOG.
- On stage, after the API crew finishes the judge's pick: Darian's Grok Bot app with the crew Bots, the routine our webhook just fired, and Vic's cloud browser on a competitor's menu, while the shop shows `GROK BOT CREW` events arriving.
