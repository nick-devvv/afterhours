# Decisions

Newest at the bottom. Add one line when you pick something the spec didn't settle.

1. **New project, not Plumb.** Name: Afterhours. Repo: `nick-devvv/afterhours` (public). Only Nick's 3D shop engine carries over, and the README says so.
2. **Branches:** `nick/frontend` (Nick, UI), `darian/backend` (Darian, the whole backend), `rayyan/deck` (Rayyan, deck and demo). PRs into `main`.
3. **Real data only.** The judge's pick runs on public sources with a link for every claim. No mock crew, no sample shop in the live app.
4. **Code computes money.** Agents report facts; `lib/engine` computes; drafts with wrong figures get 422.
5. **Texting over Telegram today.** Twilio can't text US numbers without toll-free verification (days). Sendblue's iMessage sandbox only if it works on the first try.
6. **The DAG lives in our backend** for both crews. Grok Bots each do one job when their routine's webhook fires, and the API crew takes over any job a Bot doesn't finish.
7. **Due 4:45 PM.** P0 is cut to: lookup → Rosa, Vic, Otto (June if time) → findings with proof in the shop → Telegram text → `YES 1`. Everything else is stretch or roadmap.
8. **Dot, the file clerk.** Owners send all their exports at once instead of dropping each file in the right slot. Code sorts by headers and values; Grok only resolves low-confidence files, and its column mapping is checked against the real headers. PDFs, images and Excel are listed as skipped with a reason (export CSV for now).
9. **Price-change fix titles** may only use our price and the recommended price (a competitor's price in the title is a 422), so Fern can't recommend a different number than the engine.
