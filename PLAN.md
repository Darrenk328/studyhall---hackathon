# Studyhall: build plan

For Claude Code: this is the source of truth for the project. Work phase by phase. At the end of each phase, run the acceptance checks, commit, and stop to report before starting the next phase. If anything here conflicts with current official docs (Anthropic, You.com, MCP SDK), follow the docs and note the change in DECISIONS.md.

> Revised 2026-11-13: the website is the product, the phases are reordered, and there's a design spec (§7). The earlier version is in git history; see DECISIONS.md.

## 1. What we're building

A chatbot organized by category (Gaming, Health, Business, and others) that gives accurate, current answers with receipts. LLMs are frozen at their training cutoff and guess confidently when they don't know. Studyhall doesn't guess. Before it answers, it studies: it searches the live web for that category, reads the sources, takes study notes, answers only from what it read, checks its own citations, and shows the evidence.

**The website is the product.** One engine (`packages/core`) powers it. A Claude Code plugin (MCP server, slash commands, skill, fact-checking subagent) is an optional bonus built only after the website ships (Phase 8). It must never block the website.

### Success criteria (what the demo must prove)

- On time-sensitive questions, Studyhall is measurably more accurate than the same model answering without search. The eval harness in Phase 6 produces this number.
- Every factual sentence has a citation, and every citation points to a real source that was retrieved.
- When sources are missing or conflict, Studyhall says so instead of guessing.
- Every answer shows an "as of" timestamp and how fresh its newest source is.

## 2. Architecture

```
                 ┌──────────────── packages/core ────────────────┐
 question ──▶    │ 1 PLAN     category-aware query planning       │
 + category      │ 2 SEARCH   You.com Search (freshness, domains) │
 + history       │ 3 READ     You.com Contents (full page text)   │
                 │ 4 NOTES    study notes  ║ 5 ANSWER  cited,     │
                 │            (parallel)   ║   streaming          │
                 │ 6 VERIFY   claim-by-claim check, one repair    │
                 │ 7 RECEIPTS sources, dates, confidence, trace   │
                 └───────────────────────┬───────────────────────┘
                                         │ events (AsyncIterable)
                             apps/web (Next.js) — the product
                             /api/answer (SSE) + chat UI + receipts
                                         ┊
                   bonus, Phase 8: packages/mcp-server + plugin/
```

### Monorepo layout

```
studyhall/
├── PLAN.md  DECISIONS.md  README.md  .env.example
├── package.json            # pnpm workspaces
├── packages/
│   ├── core/               # the engine, no UI, fully unit-tested
│   │   ├── src/categories/ # one file per category + registry.ts
│   │   ├── src/pipeline/   # plan search read notes answer verify receipts run
│   │   ├── src/providers/  # you.ts (search, contents), claude.ts
│   │   └── test/
│   └── mcp-server/         # Phase 8 bonus: stdio MCP server exposing core as tools
├── apps/
│   └── web/                # Next.js App Router website (the product)
├── plugin/                 # Phase 8 bonus: Claude Code plugin
└── evals/                  # questions, runner, results, manual runs
```

### Stack

- TypeScript everywhere, Node 20+, pnpm workspaces, Vitest, Zod for every external payload.
- Anthropic TypeScript SDK. Use `claude-sonnet-5-5` for answer and verify, and `claude-haiku-5-5` for planning, notes and other cheap steps. Keep model names and per-step settings in one config file.
- You.com APIs with the `X-API-Key` header, key in `YDC_API_KEY`:
  - Search: `POST https://ydc-index.io/v1/search`. Use `freshness`, `count`, `boost_domains` and `exclude_domains`. Results arrive in `results.web[]` (news included).
  - Contents: `POST https://ydc-index.io/v1/contents` with `{ urls, formats: ["markdown", "metadata"], crawl_timeout }`.
  - Research (optional): `POST https://api.you.com/v1/research`. This is a cited one-shot answer. Use it only as a baseline in evals; our own pipeline is the product.
- Web: Next.js App Router on the Node runtime, an API route that streams with SSE, Tailwind.
- MCP (bonus only): the official `@modelcontextprotocol/sdk`, stdio transport.

## 3. Categories are config, not prompts

Each category is a typed object. Adding a category means adding a file, with no pipeline changes.

```ts
// packages/core/src/categories/types.ts
export interface Category {
  id: string;                    // "health"
  name: string;                  // "Health"
  emoji: string;
  description: string;
  persona: string;               // expert lens for the answer step
  freshness: "day" | "week" | "month" | "year" | "any";   // default search window
  preferredDomains: string[];    // boosted in ranking, e.g. cdc.gov, nih.gov, who.int
  authorityDomains: string[];    // official/primary sources only; subset of preferred; used only for confidence
  blockedDomains: string[];      // content farms, known low-quality sites
  queryHints: string[];          // e.g. "add the current year", "include 'patch notes'"
  safety?: string;               // e.g. "no diagnosis; point to a clinician"
  professional?: string;         // who to point people to on refusals (health, legal, finance)
  minSources: number;            // refuse to answer below this
  starters: string[];            // example questions for the UI
}
```

Ship 12: gaming, health, business, finance, tech, science, legal, travel, food, sports, learning, creative. Each needs real `preferredDomains` and `authorityDomains`:

- Health: who.int, cdc.gov, nih.gov, nhs.uk, mayoclinic.org (authorities: who.int, cdc.gov, nih.gov, nhs.uk, fda.gov, medlineplus.gov)
- Finance: sec.gov, federalreserve.gov, investopedia.com (authorities: federalreserve.gov, sec.gov, irs.gov, bls.gov, …)
- Gaming: official publisher sites, patch-notes pages, ign.com, pcgamer.com (authorities: official publisher and platform sites)

Health, finance, and legal get safety text, a `professional`, and `minSources >= 2`.

Add an `auto` category. A cheap classifier call picks the category when the user doesn't.

## 4. The pipeline (packages/core)

`answer(question, categoryId, opts) -> AsyncIterable<PipelineEvent>`. `opts` include an `AbortSignal` and the conversation `history`.

It streams typed events so every UI can show progress: `category`, `planning`, `queries`, `searching`, `sources`, `reading`, `notes`, `answer_delta`, `answer_replaced`, `verifying`, `verdicts`, `done`, `error`.

1. **Plan (haiku):** from the question, the recent history, the category, and today's date, produce 2–4 standalone queries as JSON. Apply the category's queryHints, and include at least one query with the current year.
2. **Search:** run the queries in parallel with the category's freshness setting, `boost_domains` = preferred and `exclude_domains` = blocked. Merge results and dedupe by normalized URL. Score each source with this formula: `score = rankScore + 2*(preferred domain) + 1*(found by >1 query) + recencyBoost - 99*(blocked)`. Keep the top N (default 8). If too few results fall inside the window, search again without the date filter.
3. **Read:** send the top K (default 5) to the Contents API with a 5s crawl timeout. Fall back to snippets on failure and record the reason. Chunk long pages, then keep the chunks most relevant to the question using a simple keyword-overlap score. Cap the total context.
4. **Study notes (haiku, JSON, in parallel with the answer):** from the sources that were read, produce `{ focus, keyPoints[], conflicts[], mayBeStale[] }`, each item with source ids. Notes stream to the website as soon as they're ready and never delay verification.
5. **Answer (sonnet, streaming):** number the sources [1]..[n], with title, URL, published date, and text. The system prompt rules are:
   - Cite every factual claim inline.
   - Use only the provided sources.
   - Report conflicts between sources.
   - Lead with the direct answer.
   - Give dates for time-sensitive facts.
   - Apply the category persona and safety text.
   - If fewer than minSources usable sources exist, don't answer. Say what was found and what's missing (written by code, not the model).
   - If the model declines, the outcome is `refused`: never retry on another model, and point health, legal and finance questions to a professional.
6. **Verify (sonnet, JSON):** split the answer into claims. For each claim and its cited source text, return `supported | partial | unsupported | meta`, plus a `contradicted` flag. Any contradicted detail (number, date, name, negation) means unsupported. `meta` covers sentences about the sources themselves, scope statements and disclaimers; it isn't graded. Then:
   - Remove citation numbers that don't exist.
   - If any claim is unsupported, run one repair pass that rewrites only those sentences, either softening them with a citation or deleting them. Re-verify only the rewritten sentences in one call, and rebuild the claim list against the final text. Never loop more than once.
   - Every claim carries its character span in the final answer, so the UI can underline it.
7. **Receipts:** compute a confidence level and an "as of" stamp, and return the full trace: `{ queries, sources[{id,url,title,domain,published,readStatus,cited,preferred,authority}], studyNotes, claims[{text,verdict,sourceIds,span}], removedClaims, confidence, confidenceReasons, asOf, newestSourceAge, models, timingsMs, warnings }`.

Confidence ignores `meta` claims:

- **High:** all claims are supported, the newest cited source fits the category's freshness window, and the sources are independent: at least 2 distinct domains, or one domain on the category's `authorityDomains` list with at least 2 distinct pages cited.
- **Medium:** nothing is unsupported, but High isn't met.
- **Low:** otherwise.

### Non-negotiables

- No answer from model memory alone. If search returns nothing, the bot says it couldn't verify and offers what to check.
- Every external payload is parsed with Zod.
- Timeouts and retries apply to every network call. Retry only on 429 and 5xx. An overloaded model fails over once to a second model; refusals never do.
- Cancellation: an aborted request stops every upstream call.
- Cache search and contents responses on disk in dev, keyed by request hash, to save credits while iterating.
- Verification must be proven, not assumed: planted-error tests (number, negation, entity) must be graded unsupported, recorded and live.

## 5. API (apps/web)

- `POST /api/answer` takes `{ question, category, history }`, validated with Zod, and streams pipeline events as SSE (`event: <type>` / `data: <json>`).
  - Node runtime, `maxDuration` high enough for the slowest answer.
  - Questions are capped at 1,000 characters, and history at 6 turns.
  - Rate limit: 10 questions per minute per IP (HTTP 429 with `Retry-After`).
  - When the client disconnects, abort all upstream calls.
- `GET /api/categories` returns public fields only (id, name, emoji, description, starters), plus `auto`.
- `GET /api/health` returns liveness and which keys are configured (names, never values).
- Never expose API keys to the client.

## 6. Website (apps/web)

- **Layout:** a category rail (a chip row on mobile). The category is set by the URL hash (`/#health`). A header with the emoji, name, and one-line description. An empty state with 3 starter chips.
- **Each turn:**
  1. The user bubble.
  2. A live status line with a pulsing dot ("Searching 3 queries…", "Reading 5 sources…").
  3. The yellow Study notes card.
  4. The serif answer streaming in, with `[n]` citation chips. Hover shows title, domain, and date; click opens the receipts drawer.
  5. Verdict underlines once verify finishes: dotted for partial, red wavy for unsupported, nothing for meta.
  6. A footer with the confidence badge, "As of", and the newest source's age.
- **Receipts drawer** (a bottom sheet on mobile): queries, sources with read status, claim verdicts, which model handled each step, and timings.
- **Composer:** an auto-growing textarea. Enter sends. The Ask button becomes Stop while an answer runs.
- **History:** each category keeps its own history in sessionStorage.
- **Compare mode (Phase 5):** a "Compare with no search" toggle runs the bare model side by side, labeled "From memory, unverified".
- **About page (Phase 5):** `/about` shows a diagram of the steps, the eval table, and a note on limits.

## 7. Design spec

Define colors as CSS variables (light / dark):

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#E9EEE8` | `#131915` |
| `--panel` | `#F6F8F4` | `#1B231E` |
| `--ink` | `#1D2822` | `#E4ECE6` |
| `--muted` | `#5B6A61` | `#9AAAA0` |
| `--line` | `#C9D3CA` | `#2E3A33` |
| `--accent` | `#1F5F7A` | `#6FB3D2` |
| `--accent-ink` | `#FFFFFF` | `#0E1A20` |
| `--note` | `#FFF7D6` | `#2A2715` |
| `--note-line` | `#E3D48E` | `#5A5126` |
| `--note-ink` | `#4A3F12` | `#EDE2B0` |
| `--user-bubble` | `#DCE7EE` | `#1F3340` |
| `--error` | `#9B2C2C` | `#F09A9A` |

- **Type:** Figtree for the UI. Source Serif 4 for answers at 1.05rem, line-height 1.65, max 72ch.
- **Layout:** a 240px category rail, and a max page width of 1200px.
- **Emphasis:** the Study notes card is the one bold element: a yellow sticky note rotated −0.3deg. Keep everything else quiet.
- **Motion:** the only motion is the pulsing dot, and it respects `prefers-reduced-motion`.
- **Accessibility:** visible focus rings, and WCAG AA contrast everywhere.
- **Copy:** sentence case. The button says "Ask".

## 8. Phases

Each phase ends with passing checks and a commit. Phases 0–2 are done.

- **Phase 0 – Scaffold.** ✅ Done. Workspaces, TS config, lint, Vitest, .env.example, DECISIONS.md, and a Next.js app that builds.
- **Phase 1 – Providers.** ✅ Done. You.com search and contents clients and the Claude wrapper, with Zod schemas, retries, and the dev disk cache. `pnpm smoke` prints real results.
- **Phase 2 – Categories + pipeline.** ✅ Done. 12 categories plus auto, the full pipeline with notes, verify, repair and re-verify, receipts and confidence, `pnpm ask`, the 36-question manual run, and planted-error tests.
- **Phase 3 – API route.** Build `POST /api/answer` (SSE) and `GET /api/categories` as described in §5.
  - ✅ `curl -N` streams end to end.
  - ✅ A disconnect cancels the upstream calls.
- **Phase 4 – Website UI.** Build §6 (without compare mode) to the §7 design spec.
  - ✅ Works at 375px, 768px, and 1280px, in light and dark mode, and keyboard-only.
  - ✅ No keys in client bundles.
- **Phase 5 – Compare mode and About page.** The "Compare with no search" toggle and `/about`.
- **Phase 6 – Evals.** Write `evals/questions.jsonl` with about 5 time-sensitive questions per category, each with an `expected` answer and a `checked_on` date.
  - Compare the bare model, Studyhall, and the You.com Research API.
  - Grade with an LLM judge plus exact-match where possible.
  - Measure accuracy, citation validity, unsupported-claim rate, refusal rate, and latency.
  - ✅ `pnpm eval` writes `evals/results.md` with a table, which `/about` shows.
- **Phase 7 – Deploy and demo.** Deploy on Vercel with a real `ANTHROPIC_API_KEY`. Add `?demo=1` to replay recorded runs offline. Write the README and the demo script.
- **Phase 8 – BONUS: MCP server and Claude Code plugin.** Only after Phase 7. See §11.

## 9. Demo script (3 minutes)

1. Turn on "Compare with no search" and ask something that changed last week. The bare model answers confidently and wrongly ("From memory, unverified").
2. Studyhall answers the same question side by side. Show the live study steps, the study notes, the cited answer, and the "as of" stamp. Then open the receipts.
3. Ask something with conflicting sources. Studyhall shows the disagreement instead of picking a side silently.
4. Ask something with no good sources. Studyhall declines to guess.
5. Show the eval table on `/about`: accuracy on fresh questions, bare model vs Studyhall.
6. (Only if Phase 8 shipped) Switch to Claude Code and run `/ask finance ...` and `/factcheck ...` with the plugin.

## 10. Risks and mitigations

- **API credits run out during the demo.** Keep the dev cache, use `?demo=1` to replay recorded runs, and pre-record a backup video.
- **Latency.** Run search in parallel and read in parallel. Run notes alongside the answer. Stream the answer while verifying in the background. Verdict underlines appear when verification finishes.
- **Bad sources.** Use the per-category preferred, authority and blocked domains. High confidence needs 2+ domains or 2+ pages from an authority.
- **Paywalls and JS-heavy pages.** Fall back to snippets and label those sources "snippets only".
- **API drift.** Zod parsing fails loudly. Check the schemas against the docs.
- **Abuse and cost.** Per-IP rate limits, input caps, and cancellation on disconnect.

## 11. Bonus (Phase 8): MCP server and Claude Code plugin

Build only after Phase 7. Nothing here may block the website.

### MCP server (packages/mcp-server)

Tools, with clear descriptions because Claude picks tools by their descriptions:

| Tool | Input | Returns |
|---|---|---|
| `list_categories` | none | ids, names, descriptions |
| `live_answer` | question, category? (default auto) | answer markdown + receipts JSON |
| `search_category` | query, category, freshness? | ranked sources with snippets |
| `read_sources` | urls[] (max 5) | extracted text per URL |
| `fact_check` | claim, category? | verdict, evidence quotes, sources |

Return answers as text content that already includes a compact sources list, so the receipts survive in any client. Put the full receipts in a second content block. Read `YDC_API_KEY` and Anthropic credentials from env, and fail with a clear message if either is missing.

### Claude Code plugin (plugin/)

Follow the current Claude Code plugin docs. The manifest goes in `.claude-plugin/plugin.json` (kebab-case name is required). Components are auto-discovered from `commands/`, `agents/`, `skills/`, and `.mcp.json`. Use `${CLAUDE_PLUGIN_ROOT}` for every path inside the plugin.

- `.mcp.json`: launches `node ${CLAUDE_PLUGIN_ROOT}/server/index.js` and passes through `YDC_API_KEY` and `ANTHROPIC_API_KEY`. The build step bundles the MCP server into `plugin/server/` (tsup or esbuild, one file), so the plugin works without the monorepo.
- `commands/ask.md` handles `/ask <category> <question>` and calls `live_answer`. It prints the answer, then a sources table.
- `commands/categories.md` handles `/categories` and lists the categories with examples.
- `commands/factcheck.md` handles `/factcheck <claim>` and calls `fact_check`.
- `skills/live-answers/SKILL.md` tells Claude to use `live_answer` whenever a question depends on current facts (prices, versions, standings, news, laws, people's current roles) instead of answering from memory.
- `agents/fact-checker.md` is a subagent that takes a draft, extracts claims, calls `fact_check` on each, and returns a corrected draft with citations.
- Add a local marketplace file so judges can install the plugin in one command, and put the install steps in the README.

✅ Tools work in MCP Inspector. ✅ A fresh Claude Code session installs the plugin from the local marketplace, and `/ask` and `/factcheck` work end to end.

## 12. Stretch goals

- Category-specific data sources beyond web search, such as sports scores, market data, and patch-note feeds.
- A "follow this topic" option that re-runs a question daily and highlights what changed.
- Per-user preferred sources.
- A claude.ai connector by hosting the MCP server over HTTP.
