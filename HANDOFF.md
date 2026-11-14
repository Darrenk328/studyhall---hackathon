# Handoff: Studyhall, Phase 7 (deploy + demo)

For a teammate picking this up on their own machine with their own Claude Code. You don't need the earlier conversation: everything is in the repo.

## What Studyhall is

Studyhall is a category-organized chatbot (Health, Finance, Engineering Software and 10 more) that studies before it answers. It searches the live web with You.com, reads the pages, answers only from what it read with a citation on every sentence, and then has a second model check each claim against the page it cites. Every answer comes with receipts: sources, per-claim verdicts, freshness and an earned confidence badge, plus an optional side-by-side "from memory" answer that shows what the bare model would have said.

## Current status

- **Done:** Phases 0 to 6 (scaffold, providers, pipeline, API, website, compare mode and About page, evals). Phase 7 is built and **deployed** (Nov 13, 2026); see "Deployment status" below.
- **Built for Phase 7:**
  - Upstash Redis rate limit and daily cap.
  - `?demo=1` replay mode.
  - Vercel deploy steps.
  - A 3-minute demo script.
  - Official-source preference for the current software release.
  - Sharper software search ranking.
- **Phase 8** (MCP server and Claude Code plugin) hasn't started. `packages/mcp-server` and `plugin/` are stubs.
- **Eval results** (Nov 13, 2026; 65 questions; same day; blind judge; judge grades hand-checked on a 10-answer sample, 100% agreement):

  | | Bare model, from memory | Studyhall | You.com Research API |
  |---|---|---|---|
  | Time-sensitive (49) | 31% | 92% | 94% |
  | All (65) | 46% | 92% | 94% |

- **Pitch framing:** Studyhall matches the You.com Research API on accuracy (92% vs 94%) and shows claim-level receipts. Never claim it's more accurate than You.com.
- **Latest commit:** run `git log --oneline -1` on `main`. Everything is pushed to https://github.com/Darrenk328/studyhall-.

## Team context

**Team:** Darren (project owner) and Ryan (deploy and Phase 7).

**Deadlines:** none set yet. Ryan should check with Darren before demo day.

**Submission requirements:** the hackathon hasn't specified any so far.

**Accounts and budget**
- Darren owns the You.com and Anthropic accounts.
- There's no fixed budget. For reference, a full eval run costs about $10 and each live answer about $0.09.
- If the You.com key returns HTTP 402, the credit has run out. Ask Darren to top it up.

**Vercel:** the site is deployed on Ryan's Vercel account (Hobby plan). Hobby can't add members, so Darren has no Vercel access; ask Ryan for redeploys or settings changes. Giving Darren access would need Vercel Pro, so agree before paying.

**Submission:** no deadline or submission requirements yet.

**Roles after the deploy:** Darren works through the remaining Phase 7 checklist. Ryan handles Vercel only: syncing the fork after merges, redeploys and settings.

**Rules for Claude Code and every contributor**
- **Pitch honesty:**
  - Studyhall is on par with the You.com Research API (92% vs 94%). Never claim it's more accurate.
  - Lead with time-sensitive questions: 31% from memory vs 92% for Studyhall.
  - The judge's grades were hand-checked on a 10-answer sample, with 100% agreement.
- **Don't tune the eval:** no changes to the judge, the questions or the expected answers to improve results. Report any rerun as-is, in DECISIONS.md.
- **Scope freeze:** finish Phase 7 first. Phase 8 (the Claude Code plugin) and CAD script generation are on hold unless Darren agrees.
- **Branches and pull requests,** not direct pushes to `main`.
- **Log every decision in DECISIONS.md.**

**Backup plan:** after deploying, record a 3-minute screen video of [docs/demo-script.md](docs/demo-script.md) on the live site. `?demo=1` (recorded answers, labeled as replays) is the offline fallback.

## Local setup from a fresh clone

You need Node 20 or newer (tested on 22) and pnpm 10.34.9. The repo pins pnpm with `packageManager`, so `corepack enable` gives you the right version.

```bash
git clone https://github.com/Darrenk328/studyhall-.git studyhall
```

```bash
cd studyhall && corepack enable && pnpm install
```

```bash
cp .env.example .env
```

Open `.env` and fill in:

- **`ANTHROPIC_API_KEY`:** your own key from console.anthropic.com. You need it, because the original developer used an `ant auth login` profile that only exists on their machine.
- **`YDC_API_KEY`:** a You.com API key from you.com/platform. It's prepaid; ask the team for the shared one or use your own.

Every variable has a one-line comment in `.env.example`. Leave the Upstash ones empty locally: the limits fall back to memory.

```bash
pnpm build && pnpm test
```

You should see about 188 core tests (4 skipped: the live checks) and 41 web tests, all passing.

```bash
pnpm --filter @studyhall/web dev
```

Then open http://localhost:3000, http://localhost:3000/about and http://localhost:3000/?demo=1. One live question from the terminal:

```bash
pnpm ask travel "How much does a UK ETA cost?"
```

## Deploy to Vercel

1. **Import the project.** In Vercel, choose Add New → Project and import `Darrenk328/studyhall-`. Set **Root Directory** to `apps/web`. Leave the framework (Next.js) and the build command (`pnpm build`) as detected; the web build script rebuilds `@studyhall/core` first.
2. **Set environment variables** (Production, and Preview if you want preview deploys):
   - `ANTHROPIC_API_KEY`: a real key.
   - `YDC_API_KEY`
   - `DAILY_QUESTION_CAP` = `100`
3. **Deploy once.**
4. **Add Redis.** In the project's **Storage** tab, add **Upstash for Redis** from the Marketplace, create a database (free tier is fine) and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically; the code also accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
5. **Redeploy** (Deployments → ⋯ → Redeploy). Environment variables only apply to new deployments.
6. **Check health** at `https://<your-app>.vercel.app/api/health`. A healthy response looks like this:

   ```json
   {"ok":true,"core":"0.3.1","env":{"YDC_API_KEY":true,"ANTHROPIC_API_KEY":true},"search":"ok","searchCheckedAt":"2026-11-14T02:00:00.000Z","limits":{"store":"upstash-redis","perIpPerMinute":10,"dailyCap":100}}
   ```

   - `core` must equal `VERSION` in `packages/core/src/index.ts`. If it's older, the deploy built a stale core (see Known gotchas).
   - `store` must say `upstash-redis`. `memory` means the Redis variables aren't reaching the deployment: check the Storage connection, then redeploy.
   - Both keys must be `true`.
   - `search` is what real questions last saw from You.com. `ok`: searches work. `out_of_credit`: the last search got HTTP 402, so add credit. `unknown`: no question has run since a deploy or for a week. Checking it costs no API calls.

**If `maxDuration` is rejected.** `apps/web/app/api/answer/route.ts` sets `export const maxDuration = 90`, because answers take 10 to 30s and the route allows headroom for a repair pass. If the build or deploy says this is over your plan's limit:

- Either turn on **Fluid compute** (Project Settings → Functions), which allows longer durations on current plans,
- or lower the value to `60` in that file. Nearly all answers finish well under 60s; the eval median was 13s and the slowest about 30s.

Commit whichever change you make, and note it in `DECISIONS.md`.

## Deployment status (Nov 14, 2026)

- **Live:** https://studyhall-ebon.vercel.app (demo: `/?demo=1`, health: `/api/health`).
- **Source:** Ryan's fork, `Rayan-Python/studyhall-` (`main`), because Vercel only lists repos the signed-in account owns. Vercel team "Modguard" (an accidental name, harmless), project `studyhall`, Hobby plan.
- **Release workflow (confirmed Nov 14 with core 0.3.3):** Darren merges a pull request into `Darrenk328/studyhall-`. Ryan clicks **Sync fork → Update branch** on GitHub. Because the fork's `main` is ahead of Darren's, the sync makes a merge commit authored by Ryan, and Vercel deploys that commit automatically. Then check `/api/health`: `core` should equal `VERSION` in `packages/core/src/index.ts`.
  - **Why Ryan's merge commit matters:** Vercel Hobby blocks commits authored by Darren ("Vercel user not found"), because Darren's account isn't on Ryan's Hobby team and can't be added on Hobby. A fast-forward sync would deploy Darren's commit and be blocked.
  - **Keep the fork ahead:** don't discard the fork's extra commits when syncing (the empty commit `142d536` started this). If a sync ever fast-forwards, push an empty commit to the fork's `main` before syncing.
  - **If a deployment still shows Blocked or Skipped – Not affected:** in Vercel → **Deployments**, click **⋯** (next to the "Project Deployments" heading) → **Create Deployment**, enter `main`, target Production. Don't use **Redeploy** on an older row: it rebuilds that row's old commit.
- **Settings:** Root Directory `apps/web`; `ANTHROPIC_API_KEY`, `YDC_API_KEY`, `DAILY_QUESTION_CAP=100`; Upstash for Redis (free, `iad1`) through the Vercel integration, which sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
- **Health (Nov 14, after the 0.3.3 deploy):** `{"ok":true,"core":"0.3.3","env":{"YDC_API_KEY":true,"ANTHROPIC_API_KEY":true},"search":"ok","searchCheckedAt":"2026-11-14T02:33:38.323Z","limits":{"store":"upstash-redis","perIpPerMinute":10,"dailyCap":100}}`
- **Tested (Nov 14, core `0.3.1`):** `?demo=1` shows all four demo buttons, and each replays in its own category with the "Replay of a live answer recorded …" label, compare columns and "Where they differ", without calling `/api/answer`. One live Engineering question ("What's new in the latest MATLAB release?") answered in 29s from MathWorks sources. At 1280px and 375px the page doesn't scroll sideways, including with the Receipts drawer open. See DECISIONS.md, "Live check after the Nov 14 sync".
- **Known, not fixed:** at phone width, a tooltip on a citation near the left edge is partly cut off. It's pre-existing and cosmetic; the page doesn't scroll sideways (PR #1 fixed that).

## Remaining Phase 7 checklist

- [x] **Deploy and verify `/api/health`:** Redis active (`"store":"upstash-redis"`), core version current, both keys `true`, `dailyCap` 100.
- [x] **Merge PR #1** (phone tooltip overflow): merged as `1823255`; Ryan syncs the fork.
- [x] **Re-record the Science (Artemis II) and MATLAB demos.** Done in PR #5; all four are in `apps/web/public/demo/recordings.json` and live. To re-record one later, with a local or deployed app running:

  ```bash
  node scripts/record-demo.mjs --base http://localhost:3000 --only science
  ```

  ```bash
  node scripts/record-demo.mjs --base http://localhost:3000 --only engineering
  ```

  - `--only` records that one question and keeps the others. Without it, all four are re-recorded.
  - Check the printed opening lines: Science should name **Artemis II**; MATLAB should name **`mpminstall`** as the replacement for `matlab.addons.install`.
  - Then commit `apps/web/public/demo/recordings.json` with all four items and redeploy.
- [x] **Rerun the 8 engineering eval questions plus 5 random others.** Done Nov 14 (PR #6): 12 of 13 correct, against 11 of 13 for the same questions in the published run. Run files: `evals/runs/recheck-2026-11-14/`. The published results are unchanged.
- [x] **Test the deployed site** at 1280px and 375px: all four demos and one live question. Done Nov 14, see "Deployment status" above.
- [x] **Show You.com credit status in `/api/health`.** Built (core `0.3.1`):
  - A 402 from a real search or contents call sets `"search": "out_of_credit"` in Upstash Redis, and the next success sets `"ok"`. No extra API calls.
  - When every search fails with 402, the answer says "Live search is unavailable right now. Try the demo answers instead.", and the footer links `/?demo=1`.

## Feature freeze (back on from core 0.4.0, Nov 14)

The freeze was lifted once, for Check a claim (`/#check`, `POST /api/check`) and the Receipts framing; see DECISIONS.md, "Check a claim: the Receipts track". It's back on: no more pipeline changes before the demo unless something breaks. Fixes for real breakage only, each through a PR with build, tests and a note in DECISIONS.md. The demo plan is `docs/demo-script.md`, including the pre-demo checklist.

### Post-demo ideas (not built)

These cut latency or cost. Each needs the 13-question recheck (about $0.60 of You.com) before it's trusted. Details are in DECISIONS.md, "Latency of the live MATLAB question" (Nov 14).

1. **Verify in 2 or 3 parallel calls** for long answers (more than about 8 claims), split by paragraph. Could save about 5 to 7s on long answers. Risk: a claim that depends on a nearby paragraph loses context. Retest with `pnpm --filter core planted` (currently 8/8).
2. **Fresh page fetches only for release-notes and "what's new" pages,** with reference pages read from You.com's cache in a second Contents call at the same time. Read is now the slowest step for MATLAB questions (about 10s). Risk: a stale cached reference page (the `mpminstall` change was on one).
3. **Cap Engineering at 4 queries,** including the release query. Saves 2 searches ($0.01) per question; most already use 4.
4. **Search without the date filter only for the first 2 queries.** Saves about 3 searches per Engineering question. Risk: older official docs are why that search exists.
5. **Check a claim: let claims from the same text share evidence.** Each claim is judged only on its own top pages; in the Receipts eval, one half of a split claim came back unverifiable although its sibling had read the MathWorks page that settles it.
6. **Check a claim: don't force a current-year query for stable facts.** The planner always anchors one query to the year; for "An IPv6 address is 128 bits long" that found GitHub issues instead of the RFC.

## Known gotchas

- **The web build must rebuild core first.** `@studyhall/web` imports `@studyhall/core` from `packages/core/dist`. A stale `dist` once meant the site ran old pipeline code; `/api/health` showed core `0.2.0` while the source was `0.3.0`. The web app's `dev` and `build` scripts now run `pnpm --filter @studyhall/core build` first. Keep it that way, and check `core` in `/api/health` after every deploy.
- **HTTP 402 from You.com means the prepaid credit has run out.** Every search and page read fails with `payment_required`, and answers come back as "couldn't verify" or with a "Search failed" warning in the receipts. Add credit at you.com/platform. A full eval run costs about $10, mostly You.com.
- **Fusion answers go stale monthly.** Autodesk ships Fusion updates roughly every month, so `eng-fusion-build` and `eng-fusion-feature` (marked `volatile`) need their expected answers rechecked against the official release notes before any eval run. Autodesk's blog and release notes can disagree on dates by a day (see `DECISIONS.md`, "Fix 2").
- **Rate limits fall back to memory if Redis is unreachable.** On an Upstash error or timeout (2s), each check falls back to a per-instance in-memory limiter and logs `Redis unavailable`, so the site keeps answering but the limits are no longer shared. If you see that log on Vercel, check the Upstash database.
- **Never commit `.env`** or paste keys into issues or chat. `.env` and `.env.*` are gitignored; only `.env.example` is tracked.
- **`apps/web/AGENTS.md` is gitignored.** `next dev` generates it.
- **Vercel Hobby blocks commits by anyone who isn't on the project** ("Vercel user not found"). Darren's own commits are never deployed directly; Ryan's sync merge commit is. See "Release workflow" under "Deployment status".
- **Node 25 and newer don't ship `corepack`.** Install pnpm directly instead: `npm install -g pnpm@10.34.9`.
- **`pnpm install` warns "Ignored build scripts: esbuild".** That's expected and harmless: `tsx` and the tests work without that script. Don't run `pnpm approve-builds` just for this.

## Read these first, in order

1. [PLAN.md](PLAN.md): the build plan and phases.
2. [DECISIONS.md](DECISIONS.md): every deviation and why, including the eval method and the Phase 7 prep.
3. [README.md](README.md): setup, commands, API, demo mode, deploy.
4. [docs/demo-script.md](docs/demo-script.md): the 3-minute demo.
5. [docs/demo-questions.md](docs/demo-questions.md): why those demo questions.
6. [evals/results.md](evals/results.md): the full eval tables.

## Starter prompt for your Claude Code

Paste this into Claude Code from the repo root after cloning:

```text
You're picking up Phase 7 (deploy + demo) of Studyhall from a teammate. Before changing anything:

1. Read, in order: HANDOFF.md, PLAN.md, DECISIONS.md, README.md, docs/demo-script.md, docs/demo-questions.md, evals/results.md.
2. Summarize the project state back to me in under 15 lines: what Studyhall is, what's done, what's left in Phase 7, the team, deadlines and accounts from "Team context", the eval headline numbers, and the known gotchas. Then stop and wait for me.

After I confirm, work through the "Remaining Phase 7 checklist" in HANDOFF.md one item at a time, in order. After each item, stop and report what you did, what you verified (with command output or URLs), and anything that failed. Don't start the next item until I say so.

Rules (also in HANDOFF.md, "Team context"; follow all of them):
- Never put API keys in code, commits, chat or command lines. Keys go in .env locally and in Vercel's environment variables; I'll enter them myself when needed.
- Work on a branch and open a pull request for each item; never push directly to main.
- Run `pnpm build && pnpm test` before every commit. Log every decision in DECISIONS.md.
- Finish Phase 7 first: no Phase 8 (plugin) or CAD script generation unless Darren agrees.
- Never change the eval judge, questions or expected answers to improve results; report reruns as-is in DECISIONS.md.
- Say what a step will cost before running it: a full eval run is about $10, a live answer about $0.09.
- Don't claim Studyhall is more accurate than the You.com Research API. The published numbers are 92% vs 94%.
- Don't use `pnpm eval --publish` for rechecks; it would overwrite the published results.
- If You.com returns HTTP 402, stop and tell me: the credit has run out.
```

## Progress log (Nov 14, latest round)

- [x] PLAN.md §7 describes Ryan's dark/lime design as the standard; contrast checked (all text pairs AA; `--line` borders 1.4:1 is a known gap).
- [x] Demo script: the live MATLAB step verifies `mpminstall` exists (`which mpminstall` / `help mpminstall`) instead of installing anything. **Darren tests this on his Mac first.**
- [x] Fusion boilerplate fixed (Application.get/Design.cast current in all Fusion snippets); held-out 4 committed first. Results as-is in DECISIONS.md: original 6/6 flagged, 0/6 false flags; held-out 0/2 flagged (properties not parsed), 0/2 false flags. Follow-ups: parse properties; `.item` accessors.
- [x] OpenCrawl: researched; capture installed for ~/studyhall only (no history; other projects and the long build session excluded; nothing uploaded); MCP added locally, **Darren signs in with /mcp**; docs/opencrawl.md (Ryan joins, conventions, proposal) and docs/opencrawl-story.md.

