# Handoff: Studyhall, Phase 7 (deploy + demo)

For a teammate picking this up on their own machine with their own Claude Code. You don't need the earlier conversation: everything is in the repo.

## What Studyhall is

Studyhall is a category-organized chatbot (Health, Finance, Engineering Software and 10 more) that studies before it answers. It searches the live web with You.com, reads the pages, answers only from what it read with a citation on every sentence, and then has a second model check each claim against the page it cites. Every answer comes with receipts: sources, per-claim verdicts, freshness and an earned confidence badge, plus an optional side-by-side "from memory" answer that shows what the bare model would have said.

## Current status

- **Done:** Phases 0 to 6 (scaffold, providers, pipeline, API, website, compare mode and About page, evals). Most of Phase 7 is built but **not deployed**.
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

Fields marked **TBD** haven't been filled in yet. Ask Darren for them before you rely on them.

**Deadlines**
- Submissions close: **TBD (date, time and time zone)**
- Demo: **TBD (date, time and time zone)**
- Presenter: **TBD**

**Submission requirements:** **TBD**. Expect some of: live URL, repo link, demo video, write-up, submission form link. Check the hackathon's own page for the definitive list.

**Accounts and budget**
- Darren owns the You.com and Anthropic accounts. The Vercel account owner is **TBD (Darren or teammate)**.
- About **$TBD** of credit is left. Ask Darren before spending more than **$TBD**.
- A full eval run (`pnpm eval` on all 65 questions, three systems) costs about $10, mostly You.com. Don't rerun it without asking. Small rechecks with `--systems B --ids …` cost about $0.10 per question.

**Vercel ownership:** deploy under a shared Vercel team, or invite Darren to the project as a member, so more than one person can redeploy, read logs and change environment variables.

**Rules for Claude Code and every contributor**
- **Pitch honesty:**
  - Studyhall matches the You.com Research API on accuracy (92% vs 94%). Never claim it's more accurate.
  - Lead with time-sensitive questions: 31% correct from memory vs 92% for Studyhall.
  - When asked how answers were graded: the judge's grades were hand-checked on a 10-answer sample, with 100% agreement.
- **Don't tune the eval:** no changes to the judge, the questions or the expected answers to improve results. Report any rerun as-is, with its numbers, in DECISIONS.md, even if they're worse.
- **Scope freeze:** finish Phase 7 only. Phase 8 (the MCP server and Claude Code plugin) and CAD script generation are on hold unless Darren agrees.
- **Branches and pull requests:** don't push directly to `main`. One branch per checklist item is a good default.
- **Log every decision in DECISIONS.md**, including small ones: a changed `maxDuration`, a re-recorded demo, a rerun's results.

**Backup plan:** after deploying, record a 3-minute screen video of [docs/demo-script.md](docs/demo-script.md) on the live site, so there's a demo even if the venue's network or an API fails. If the site is up but live search isn't working, use `?demo=1` (recorded answers, labeled as replays) as the fallback.

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
   {"ok":true,"core":"0.3.0","env":{"YDC_API_KEY":true,"ANTHROPIC_API_KEY":true},"limits":{"store":"upstash-redis","perIpPerMinute":10,"dailyCap":100}}
   ```

   - `core` must equal `VERSION` in `packages/core/src/index.ts`. If it's older, the deploy built a stale core (see Known gotchas).
   - `store` must say `upstash-redis`. `memory` means the Redis variables aren't reaching the deployment: check the Storage connection, then redeploy.
   - Both keys must be `true`.

**If `maxDuration` is rejected.** `apps/web/app/api/answer/route.ts` sets `export const maxDuration = 90`, because answers take 10 to 30s and the route allows headroom for a repair pass. If the build or deploy says this is over your plan's limit:

- Either turn on **Fluid compute** (Project Settings → Functions), which allows longer durations on current plans,
- or lower the value to `60` in that file. Nearly all answers finish well under 60s; the eval median was 13s and the slowest about 30s.

Commit whichever change you make, and note it in `DECISIONS.md`.

## Remaining Phase 7 checklist

- [ ] **Deploy and verify `/api/health`:** Redis active (`"store":"upstash-redis"`), core version current, both keys `true`, `dailyCap` 100.
- [ ] **Re-record the Science (Artemis II) and MATLAB demos.** Their last recordings failed because the You.com credit ran out (HTTP 402). `apps/web/public/demo/recordings.json` is committed with the two good ones (Travel, Tech), so the demo bar shows two buttons until you add the others. With a local or deployed app running:

  ```bash
  node scripts/record-demo.mjs --base http://localhost:3000 --only science
  ```

  ```bash
  node scripts/record-demo.mjs --base http://localhost:3000 --only engineering
  ```

  - `--only` records that one question and keeps the others. Without it, all four are re-recorded.
  - Check the printed opening lines: Science should name **Artemis II**; MATLAB should name **`mpminstall`** as the replacement for `matlab.addons.install`.
  - Then commit `apps/web/public/demo/recordings.json` with all four items and redeploy.
- [ ] **Rerun the 8 engineering eval questions plus 5 random others** against the current pipeline. The search-ranking changes (forum penalty, MathWorks mirror dedupe, release-query fix) came after the published eval. For example:

  ```bash
  pnpm eval --run recheck-$(date +%F) --systems B --ids eng-fusion-build,eng-fusion-feature,eng-inventor-release,eng-matlab-release,eng-matlab-addons-install,eng-matlab-java,eng-solidworks-fillet,eng-onshape-flow-constraint,<5 more ids from evals/questions.jsonl>
  ```

  - Don't pass `--publish`: that would overwrite the published results.
  - Compare each verdict with `evals/runs/2026-11-13/graded.jsonl` (system B) and report every difference.
  - A partial recheck before the credit ran out got 6 of 6 correct, including MATLAB Java, which declined in the published run.
- [ ] **Test the deployed site:** `?demo=1` (all four demo buttons, compare columns, the "Replay of a live answer recorded …" label, Receipts) and one live question, at desktop width and at phone width (about 375px).

## Known gotchas

- **The web build must rebuild core first.** `@studyhall/web` imports `@studyhall/core` from `packages/core/dist`. A stale `dist` once meant the site ran old pipeline code; `/api/health` showed core `0.2.0` while the source was `0.3.0`. The web app's `dev` and `build` scripts now run `pnpm --filter @studyhall/core build` first. Keep it that way, and check `core` in `/api/health` after every deploy.
- **HTTP 402 from You.com means the prepaid credit has run out.** Every search and page read fails with `payment_required`, and answers come back as "couldn't verify" or with a "Search failed" warning in the receipts. Add credit at you.com/platform. A full eval run costs about $10, mostly You.com.
- **Fusion answers go stale monthly.** Autodesk ships Fusion updates roughly every month, so `eng-fusion-build` and `eng-fusion-feature` (marked `volatile`) need their expected answers rechecked against the official release notes before any eval run. Autodesk's blog and release notes can disagree on dates by a day (see `DECISIONS.md`, "Fix 2").
- **Rate limits fall back to memory if Redis is unreachable.** On an Upstash error or timeout (2s), each check falls back to a per-instance in-memory limiter and logs `Redis unavailable`, so the site keeps answering but the limits are no longer shared. If you see that log on Vercel, check the Upstash database.
- **Never commit `.env`** or paste keys into issues or chat. `.env` and `.env.*` are gitignored; only `.env.example` is tracked.
- **`apps/web/AGENTS.md` is gitignored.** `next dev` generates it.
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
2. Summarize the project state back to me in under 15 lines: what Studyhall is, what's done, what's left in Phase 7, the deadlines and budget from "Team context" (flag any still marked TBD), the eval headline numbers, and the known gotchas. Then stop and wait for me.

After I confirm, work through the "Remaining Phase 7 checklist" in HANDOFF.md one item at a time, in order. After each item, stop and report what you did, what you verified (with command output or URLs), and anything that failed. Don't start the next item until I say so.

Rules (also in HANDOFF.md, "Team context"; follow all of them):
- Never put API keys in code, commits, chat or command lines. Keys go in .env locally and in Vercel's environment variables; I'll enter them myself when needed.
- Work on a branch and open a pull request for each item; never push directly to main.
- Run `pnpm build && pnpm test` before every commit. Log every decision in DECISIONS.md.
- Phase 7 only: no Phase 8 (plugin) or CAD script generation unless Darren agrees.
- Never change the eval judge, questions or expected answers to improve results; report reruns as-is in DECISIONS.md.
- Ask before spending: no full eval run (about $10) without Darren's OK.
- Don't claim Studyhall is more accurate than the You.com Research API. The published numbers are 92% vs 94%.
- Don't use `pnpm eval --publish` for rechecks; it would overwrite the published results.
- If You.com returns HTTP 402, stop and tell me: the credit has run out.
```
