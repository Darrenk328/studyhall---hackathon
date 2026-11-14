# Decisions

Deviations from PLAN.md and choices it leaves open. Newest at the bottom.

## Phase 0 (2026-11-11)

- **Own repo.** Studyhall lives in its own repository (`Darrenk328/studyhall-`), not inside the earlier VC Hackathon app.
- **pnpm 10.34.9**, pinned with `packageManager`. Corepack could not install pnpm on the dev machine, so it was installed with `npm i -g --prefix ~/.local pnpm@10`. Add `~/.local/bin` to `PATH`.
- **TypeScript 6.0, not 7.** TS 7.0 is the latest release, but typescript-eslint 8.x supports only `<6.1`. We stay on 6.0 until typescript-eslint supports 7.
- **`@types/node` 22** to match the Node 22 runtime. `engines` still says `>=20`.
- **ESM with NodeNext resolution.** Relative imports in packages use `.js` extensions. Packages compile with `tsc` to `dist/`. The plugin's single-file MCP bundle (Phase 4) will use tsup or esbuild.
- **Model names** live in `packages/core/src/config/models.ts`.
- **`apps/web` is a placeholder** until Phase 6, when the Next.js app is scaffolded. Getting Next.js into the build earlier would only slow the core loop.
- **Root `pnpm test`** runs each package's Vitest. `mcp-server` uses `--passWithNoTests` until Phase 3.
- **Root `pnpm typecheck`** builds core first, because `mcp-server` resolves `@studyhall/core` through its `dist/` types.

## Phase 1 (2026-11-11)

You.com docs were checked on 2026-11-11 (you.com/docs; docs.you.com now redirects there). Differences from PLAN.md §2:

- **No `results.news[]`.** News articles arrive inside `results.web[]`. The schema still accepts a legacy `news` array, and each hit records its `kind`.
- **`page_age` has no timezone** (for example `2026-11-06T12:28:05`). `parsePageAge` treats it as UTC.
- **Contents drops URLs it can't crawl** from the response array, and returns `markdown: null` for pages that fail. The client returns one entry per requested URL, marked `ok`, `failed` or `missing`, and matches echoed URLs loosely (ignoring scheme, `www.` and trailing slash).
- **Search has native domain controls:** `boost_domains` (a ranking boost), `exclude_domains` and `include_domains` (a strict allowlist). The plan's ranking formula still runs in our code. Phase 2 can also pass `preferredDomains` as `boost_domains` and `blockedDomains` as `exclude_domains`. Mixing `include_domains` with either of the others returns 422, so the client rejects that combination up front.
- **Contents also accepts `metadata`, `crawl_timeout` and `max_age`.** We request `["markdown","metadata"]`.

Claude:

- **Credentials:** the SDK resolves `ANTHROPIC_API_KEY`, then an `ant auth login` profile. Local dev uses the profile, so `.env` doesn't need `ANTHROPIC_API_KEY`. The plan's "fail if ANTHROPIC_API_KEY is missing" (§5) becomes "fail with a clear message if no Anthropic credential resolves" (`ClaudeAuthError`). Hosted deploys (Phase 7) still need a real key in env.
- **Per-step settings** live in `config/models.ts` next to the model names. Sonnet 5.5 rejects `thinking: disabled`, so answer and verify use adaptive thinking at effort `medium`. Plan and classify use Haiku 5.5 with thinking off at effort `low`. No sampling parameters (Sonnet 5.5 and Haiku 5.5 reject non-default `temperature`).
- **Refusal fallback:** Sonnet calls send `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). Haiku 5.5 has no server-side fallback, so it gets none. All calls go through `client.beta.messages`. **Superseded in Phase 2: refusals are no longer retried on another model (see below).**
- **Structured JSON** uses `beta.messages.parse` with `betaZodOutputFormat`, not prompt-and-parse.
- **Retries for Claude** use the SDK's built-in policy (2 retries on 408/409/429/5xx and connection errors). This is slightly broader than "429 and 5xx only", which our own HTTP layer (`net/http.ts`) applies to You.com.

Testing:

- **Fixtures** in `packages/core/test/fixtures/` are real You.com responses recorded by `pnpm smoke --record`, with page text and snippets trimmed.
- **Dev cache** stores the raw response before parsing, so Zod checks still run on cache hits. Its directory resolves against the repo root (where `.env` lives).

## Phase 0 fix (2026-11-11)

- **`apps/web` is a real Next.js 16 app** (App Router, Tailwind 4) with a placeholder home page and `/api/health`. It depends on `@studyhall/core`, so `pnpm build` checks that the web app can import the engine. Next only reads `.env*` files inside `apps/web`; loading the root `.env` will be wired up in the web-app phase.
- **Plan version.** The team mentioned an updated PLAN.md (website is the product, web UI is Phase 4, MCP server and plugin are a bonus Phase 8). That version isn't in the repo yet. Phase 2 is the same in both versions, so work continued. Replace PLAN.md when the updated file is shared.

## Phase 2 (2026-11-11)

Refusals and model fallback (team decision):

- **Refusals are final.** If Claude declines, the pipeline returns outcome `refused` with "I can't help with that question." Health, legal and finance add a pointer to a professional (the new `Category.professional` field). The request is never retried on another model.
- **Server-side `fallbacks` removed.** Anthropic's `fallbacks` parameter only ever triggers on refusals, never on overload or 5xx errors. Overload handling is client-side now: the SDK retries the same model twice. If it's still overloaded (529) or returning 5xx, the call is tried once on `OVERLOAD_FAILOVER_MODEL` (`claude-sonnet-5`, which has a separate rate-limit pool). A stream fails over only before any text has arrived. Set `OVERLOAD_FAILOVER_MODEL` to `undefined` in `config/models.ts` to turn this off.
- **Receipts record the model that produced each step** (`receipts.models`), as reported by the API, so a failover is visible.

Search and reading:

- **You.com does the domain work.** Each category's `preferredDomains` go to `boost_domains` and `blockedDomains` to `exclude_domains`. Our ranking formula (PLAN §4) still runs on the merged results, and any blocked domain that slips through is dropped before the top N.
- **Freshness relaxation.** If fewer than `max(minSources, 3)` results come back inside the category's freshness window, the same queries run again without a date filter. A note in the receipts says so.
- **Ranking details the plan left open:** `rankScore = 1 - bestRank/perQuery` (the top hit of a query scores 1). `recencyBoost` is 1 inside the category's window, 0.5 up to twice the window, and 0 after that or when undated. Window lengths: day 1, week 7, month 31, year 366 days.
- **Usable source** means at least 80 characters of text (page excerpt or snippets). `minSources` counts usable sources.
- **Context caps:** 6,000 characters per source and 30,000 in total. Pages are chunked (about 800 characters), and the lead chunk plus the chunks with the most question keywords are kept, in page order.
- **The planner** must return 2–4 queries, and at least one must contain the current year. If none does, code adds `<question> <year>`. If the planner fails, the question itself is searched.

Answer, verify, repair:

- **Declines without the model.** The insufficient-sources and no-results messages are written by code, not by Claude, so the model can't answer from memory on those paths.
- **Citation clean-up** runs after the answer and again after repair: `[n]` markers that match no source are removed and listed in `removedCitations`.
- **Verify** returns `{text, sourceIds, verdict, note, evidence}` per claim. Code then drops unknown source ids, and a claim with no valid citation is marked unsupported.
- **Repair runs at most once** and is not re-verified (PLAN: never loop more than once). Softened or re-cited claims become `partial`. Removed claims stay in the receipts with `repair: "removed"`. The claim `text` stays as the original sentence.
- **Events added to the plan's list:** `category` (the category, and whether auto picked it) and `answer_replaced` (whole-answer replacement after citation clean-up, repair or a refusal).

Confidence (the plan's rule, with the gap filled):

- **High:** every remaining claim supported, at least 2 distinct cited domains, and the newest cited source inside the freshness window.
- **Medium:** no unsupported claim remains, but High isn't met (some partial claims, a single domain, or stale sources). The plan only says "Medium when some claims are partial", which would make an all-supported, single-domain answer Low. We treat that as Medium.
- **Low:** an unsupported claim remains, nothing was checked, or nothing was cited. Any outcome other than `answered` is Low.
- **Auto category** falls back to `learning` if the classifier fails, and adds a note to the receipts.

Verify correctness (planted-error test):

- **Bug found and fixed.** In the first planted-error run, the checker noticed a changed date or number in all 3 cases (finance, tech, health), but graded the sentence `partial`, because the prompt defined a "different date or number" as partial. A `partial` verdict doesn't trigger repair and still allows Medium confidence, so the wrong fact would have stayed in the answer.
- **New verdict rules:** a sentence is `unsupported` if any detail conflicts with the cited sources. `partial` means nothing conflicts, but some detail isn't covered or the wording is broader than the source. The checker also returns `contradicted: boolean`, and code forces `unsupported` whenever it's true, whatever verdict the model picked.
- **After the fix,** 3 of 3 planted errors were graded `unsupported`, each with a note giving the source's real value.
- **Regression test:** `test/verify-planted.test.ts` runs on a recorded fixture (`test/fixtures/verify-planted.json`, Federal Reserve and FRED pages). `STUDYHALL_LIVE=1` reruns the same check against the live model. `pnpm --filter core planted` repeats the experiment on three fresh answers.
- **The first 36-question run** used the old prompt. It's kept as `evals/manual/phase2-run1-before-verify-fix.md` for comparison, and `evals/manual/phase2.md` is the run with the fix.
