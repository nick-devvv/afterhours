# Decisions

Newest at the bottom. Add one line when you pick something the spec didn't settle.

1. **New project, not Plumb.** Name: Afterhours. Repo: `nick-devvv/afterhours` (public). Only Nick's 3D shop engine carries over, and the README says so.
2. **Branches:** `nick/frontend` (Nick, UI), `darian/backend` (Darian, the whole backend), `rayyan/deck` (Rayyan, deck and demo). PRs into `main`.
3. **Real data only.** The judge's pick runs on public sources with a link for every claim. No mock crew, no sample shop in the live app.
4. **Code computes money.** Agents report facts; `lib/engine` computes; drafts with wrong figures get 422.
5. **Texting over Telegram today.** Twilio can't text US numbers without toll-free verification (days). Sendblue's iMessage sandbox only if it works on the first try.
6. **The DAG lives in our backend** for both crews. Grok Bots each do one job when their routine's webhook fires, and the API crew takes over any job a Bot doesn't finish.
7. **Due 4:45 PM.** P0 is cut to: lookup → Rosa, Vic, Otto (June if time) → findings with proof in the shop → Telegram text → `YES 1`. Everything else is stretch or roadmap.
