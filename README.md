# Studyhall

A category-organized chatbot that studies before it answers: it searches the live web (You.com), reads the sources, answers only from what it read with inline citations, checks its own claims, and shows the receipts.

It has two surfaces on one engine: a web chatbot and a Claude Code plugin (MCP server, slash commands, skill, fact-checking subagent).

See [PLAN.md](PLAN.md) for the full build plan and [DECISIONS.md](DECISIONS.md) for deviations.

## How it does

On 65 questions across 13 categories, each answered by all three systems on the same day (Nov 13, 2026) and graded by a blind judge against answers verified from official sources ([evals/results.md](evals/results.md)):

| | Bare model, from memory | Studyhall | You.com Research API |
|---|---|---|---|
| Time-sensitive questions (49) | 31% | **92%** | 94% |
| All questions (65) | 46% | **92%** | 94% |
| Median time | 2.4s | 13.1s | 3.8s |

- Studyhall is about as accurate as You.com's Research API, which serves here as a reference, and it shows claim-level receipts: every sentence cites a source, and a second model checks each claim against the page it cites.
- When the bare model answered a time-sensitive question instead of declining, it was wrong 21% of the time (5 of 24).
- On the 30 questions the bare model got wrong or declined, Studyhall was correct on 27 and You.com's Research API on 30.
- Studyhall's High confidence badge was correct 41 times out of 43 (the other 2 were partly correct).
- These numbers are preliminary until the human spot-check of the judge ([evals/spotcheck.md](evals/spotcheck.md)) is done.

## Status

| Phase | Status |
|---|---|
| 0 Scaffold | ✅ done |
| 1 Providers | ✅ done |
| 2 Categories + pipeline | ✅ done |
| 3 API route (SSE) | ✅ done |
| 4 Website UI | ✅ done |
| 5 Compare mode + About | ✅ done |
| 6 Evals | ✅ done (human spot-check pending) |
| 7 Deploy + demo | in progress |
| 8 Bonus: MCP server + plugin | not started |

## Setup

Requires Node 20+ and pnpm 10.

```bash
pnpm install
cp .env.example .env   # fill in YDC_API_KEY
ant auth login         # or put ANTHROPIC_API_KEY in .env
pnpm build
pnpm test
pnpm lint
pnpm smoke             # one live call to each provider
```

## Ask a question

```bash
pnpm ask health "Who should get a flu shot this season?"
pnpm ask auto "What is the latest stable version of Python?"   # auto picks the category
pnpm ask finance "What is the current federal funds rate?" --json   # full receipts
```

Categories: gaming, health, business, finance, tech, engineering, science, legal, travel, food, sports, learning, creative (or `auto`). Engineering Software is version-aware: answers open with the release their sources describe, and code is checked function by function against the sources.

`pnpm --filter core manual [--name run-name]` runs all 36 starter questions live and writes `evals/manual/<run-name>.md`.

`pnpm eval [--limit N] [--ids a,b] [--systems A,B,C] [--run name] [--grade-only] [--publish]` runs the Phase 6 evals: bare model (A), Studyhall (B) and the You.com Research API (C) on `evals/questions.jsonl`. Raw answers and receipts go to `evals/runs/<run>/raw/` (resumable). Grading is term match plus a blind Sonnet judge. `--publish` writes `evals/results.{json,md}` (read by the About page at build time), `evals/spotcheck.md` and `docs/demo-questions.md`. A full run costs about $10.
`pnpm --filter core planted [--record]` plants number, negation and entity errors in real answers and checks that verify flags each one unsupported.
`STUDYHALL_LIVE=1 pnpm --filter core test` also re-runs the recorded planted-error checks against the live model.

## Website

```bash
pnpm build && pnpm --filter @studyhall/web start   # http://localhost:3000
```

Pick a category in the rail (or `/#health`), ask, and watch it study: status line, study notes, the streamed answer with citation chips, verdict underlines, and the confidence footer. **Receipts** opens the full trace.

| Mid-answer | Finished | Receipts |
|---|---|---|
| ![](docs/screenshots/chat-1280-light-mid-answer.png) | ![](docs/screenshots/chat-1280-light-finished.png) | ![](docs/screenshots/chat-1280-light-receipts.png) |

All 12 screenshots (375px and 1280px, light and dark) are in [docs/screenshots](docs/screenshots). Regenerate them with `node scripts/screenshots.mjs` against a running app (uses 4 live questions). `node scripts/keyboard-check.mjs` runs the keyboard-only checks.

Turn on **Compare with no search** to run the same model without sources side by side ("From memory, unverified"); a **Where they differ** card lists up to 3 factual disagreements with citations. `/about` explains the pipeline and its limits. `node scripts/screenshots-compare.mjs` captures compare mode and the About page (3 live questions).

Set `DAILY_QUESTION_CAP` (default 500) to cap answered questions per day on a public deploy.

### Demo mode

`/?demo=1` adds a demo bar with four questions: the three from [docs/demo-questions.md](docs/demo-questions.md) (the bare model got each wrong in the eval and Studyhall got each right) and the MATLAB `matlab.addons.install` compare. Clicking one replays an answer recorded live from `/api/answer`, with its real timing, sources and receipts, and labels it "Replay of a live answer recorded …". Anything else you type runs live. `&speed=2` replays twice as fast. Re-record against a running app with `node scripts/record-demo.mjs --base http://localhost:3000` (or `--only <category>` for one question). The 3-minute script is [docs/demo-script.md](docs/demo-script.md).

## Deploy (Vercel)

1. Import the GitHub repo in Vercel and set **Root Directory** to `apps/web`. The framework is Next.js; the build command (`pnpm build`) builds `@studyhall/core` first.
2. Add Upstash Redis from the Vercel Marketplace (Storage → Upstash → Redis) and connect it to the project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`; `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` work too. The per-IP limit (10 per minute) and the daily cap are then shared across all serverless instances. Without Redis they fall back to per-instance memory.
3. In Project Settings → Environment Variables, add `ANTHROPIC_API_KEY` (a real key; there's no `ant` profile on Vercel) and `YDC_API_KEY`, and optionally `DAILY_QUESTION_CAP`.
4. Deploy. `GET /api/health` should show both keys `true` and `"store": "upstash-redis"`.

Answers can take up to about 30s, and the route allows 90s (`maxDuration`).

## API

Run the web app (`pnpm --filter @studyhall/web dev`, or `build` then `start`), then:

```bash
curl -N -X POST localhost:3000/api/answer -H 'content-type: application/json' \
  -d '{"question":"What is the current federal funds rate target range?","category":"finance","history":[]}'
```

The response is Server-Sent Events: one `event: <type>` / `data: <json>` message per pipeline event (`category`, `planning`, `queries`, `searching`, `sources`, `reading`, `notes`, `answer_delta`, `answer_replaced`, `verifying`, `verdicts`, `done`, `error`). The `done` event carries the full receipts. Limits: questions up to 1,000 characters, history up to 6 turns, 10 questions per minute per IP. Closing the connection cancels every upstream call.

`GET /api/categories` lists the categories (public fields only). `GET /api/health` reports liveness and which keys are set.

## Layout

```
packages/core        engine: categories, pipeline, providers (no UI)
packages/mcp-server  stdio MCP server exposing core as tools
apps/web             Next.js chat app
plugin/              Claude Code plugin (Phase 4)
evals/               questions, eval runs, results, human spot-check (Phase 6)
```
