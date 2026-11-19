# Rules for anyone (or any Bot) working in this repo

Give this file to your Grok Bot before it writes code here.

- **Read `docs/MVP_SPEC.md` first.** The contract is its Data shapes, API contract, Tools and Events sections, mirrored in `lib/types.ts`.
- **Ownership.**
  - Nick: `app/` (except `app/api/`), `public/`, design, README.
  - Darian: the whole backend: `app/api/`, `lib/`, `grokbot/`, `scripts/`, `tests/`.
  - Rayyan: `deck/` and `docs/BUILD_LOG.md`. No app code.
  - Don't edit someone else's folders. Need a change? Ask, or open a PR that only touches your side.
- **Branches.** `nick/frontend`, `darian/backend`, `rayyan/deck`. Merge into `main` through small PRs, at least once an hour. `main` is what Vercel deploys and must always build.
- **Changing the contract** means changing `lib/types.ts` and `docs/MVP_SPEC.md` in the same PR and posting it in the team chat. Darian owns the contract; Nick and Rayyan propose.
- **No fake data on stage.** Every business, price, review and competitor shown comes from a real source with a link. No mock crew, no invented numbers, no sample shop in the live app. Test fixtures live in `tests/` only.
- **Code computes money, Bots decide and write.** Every dollar amount comes from `lib/engine/`. A Bot reports facts (prices, quotes, links); it never types a dollar total. The API rejects (422) a draft whose figures don't match.
- **Money is integer cents.** The UI formats what the API returns and never hard-codes a number.
- **Estimates say so.** Anything not from the owner's own books is labeled an estimate and lists its assumptions.
- **Nothing reaches a real third party.** Texts only go to numbers in `TEXT_ALLOWLIST` (or, with `TEXT_ALLOW_SELF_LINKED=true`, to a Telegram chat whose owner pressed Start on our link themselves), emails only to `MAIL_ALLOWLIST`. We play the owner on stage; we never contact the business we scanned.
- **No secrets in git.** Keys go in `.env.local` and Vercel env only.
- **Tests run with no keys and no network:** `npm test`.
- **Log Bot work** in `docs/BUILD_LOG.md` (one line each: who, which Bot, what it did). It's our proof for "Built with Grok Bot".
