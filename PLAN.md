# Studyhall: build plan

For Claude Code: this is the source of truth for the project. Work phase by phase. At the end of each phase, run the acceptance checks, commit, and stop to report before starting the next phase. If anything here conflicts with current official docs (Anthropic, You.com, MCP SDK), follow the docs and note the change in DECISIONS.md.

## 1. What we're building

A chatbot organized by category (Gaming, Health, Business, and others) that gives accurate, current answers with receipts. LLMs are frozen at their training cutoff and guess confidently when they don't know. Studyhall doesn't guess. Before it answers, it studies: it searches the live web for that category, reads the sources, answers only from what it read, checks its own citations, and shows the evidence.

It ships as two surfaces that share one engine:

- A web chatbot with a category picker, streaming answers, and a receipts panel.
- A Claude Code plugin, so the same engine works inside Claude through an MCP server, slash commands, a skill, and a fact-checking subagent.

### Success criteria (what the demo must prove)

- On time-sensitive questions, Studyhall is measurably more accurate than the same model answering without search. The eval harness in Phase 5 produces this number.
- Every factual sentence has a citation, and every citation points to a real source that was retrieved.
- When sources are missing or conflict, Studyhall says so instead of guessing.
- Every answer shows an "as of" timestamp and how fresh its newest source is.

## 2. Architecture

```
                 ┌──────────────── packages/core ────────────────┐
 question ──▶    │ 1 PLAN     category-aware query planning       │
 + category      │ 2 SEARCH   You.com Search (freshness, domains) │
                 │ 3 READ     You.com Contents (full page text)   │
                 │ 4 ANSWER   Claude, cites only numbered sources │
                 │ 5 VERIFY   claim-by-claim check vs cited text  │
                 │ 6 RECEIPTS sources, dates, confidence, trace   │
                 └───────────────────────┬───────────────────────┘
                     ┌───────────────────┼───────────────────┐
              apps/web (Next.js)   packages/mcp-server   plugin/ (Claude Code)
              chat UI + receipts   MCP tools over core   commands, skill, agent, .mcp.json
```

### Monorepo layout

```
studyhall/
├── PLAN.md  DECISIONS.md  README.md  .env.example
├── package.json            # pnpm workspaces
├── packages/
│   ├── core/               # the engine, no UI, fully unit-tested
│   │   ├── src/categories/ # one file per category + registry.ts
│   │   ├── src/pipeline/   # plan.ts search.ts read.ts answer.ts verify.ts
│   │   ├── src/providers/  # you.ts (search, contents), claude.ts
│   │   ├── src/types.ts
│   │   └── test/
│   └── mcp-server/         # stdio MCP server exposing core as tools
├── apps/
│   └── web/                # Next.js App Router chat app
├── plugin/                 # Claude Code plugin (installable)
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json
│   ├── commands/ask.md  commands/categories.md  commands/factcheck.md
│   ├── skills/live-answers/SKILL.md
│   └── agents/fact-checker.md
└── evals/                  # questions, runner, results
```

### Stack

- TypeScript everywhere, Node 20+, pnpm workspaces, Vitest, Zod for every external payload.
- Anthropic TypeScript SDK. Use `claude-sonnet-5-5` for answer and verify, and `claude-haiku-5-5` for planning and other cheap steps. Keep model names in one config file.
- You.com APIs with the `X-API-Key` header, key in `YDC_API_KEY`:
  - Search: `https://ydc-index.io/v1/search` (POST preferred; GET still works). Use the `freshness` and `count` parameters. Responses have `results.web[]` and `results.news[]`.
  - Contents: `POST https://ydc-index.io/v1/contents` with `{ urls, formats: ["markdown"] }`.
  - Research (optional): `POST https://api.you.com/v1/research`. This is a cited one-shot answer. Use it only as a baseline in evals; our own pipeline is the product.
  - Fetch the current schemas from you.com/docs before writing the Zod types.
- MCP: the official `@modelcontextprotocol/sdk`, stdio transport.
- Web: Next.js App Router, server route that streams with SSE, Tailwind.

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
  blockedDomains: string[];      // content farms, known low-quality sites
  queryHints: string[];          // e.g. "add the current year", "include 'patch notes'"
  safety?: string;               // e.g. "no diagnosis; point to a clinician"
  minSources: number;            // refuse to answer below this
  starters: string[];            // example questions for the UI
}
```

Ship 12: gaming, health, business, finance, tech, science, legal, travel, food, sports, learning, creative. Each needs real `preferredDomains`:

- Health: who.int, cdc.gov, nih.gov, nhs.uk, mayoclinic.org
- Finance: sec.gov, federalreserve.gov, investopedia.com
- Gaming: official publisher sites, patch-notes pages, ign.com, pcgamer.com

Health, finance, and legal get safety text and `minSources >= 2`.

Add an `auto` category. A cheap classifier call picks the category when the user doesn't.

## 4. The pipeline (packages/core)

`answer(question, categoryId, opts) -> AsyncIterable<PipelineEvent>`

It streams typed events so every UI can show progress: `planning`, `queries`, `searching`, `sources`, `reading`, `answer_delta`, `verifying`, `verdicts`, `done`, `error`.

1. **Plan (haiku):** from the question, the category, and today's date, produce 2–4 queries as JSON. Apply the category's queryHints, and include at least one recency-anchored query.
2. **Search:** run the queries in parallel with the category's freshness setting. Merge results and dedupe by normalized URL. Score each source with this formula: `score = rankScore + 2*(preferred domain) + 1*(found by >1 query) + recencyBoost - 99*(blocked)`. Keep the top N (default 8).
3. **Read:** send the top K (default 5) to the Contents API. Fall back to snippets on failure and record the reason. Chunk long pages, then keep the chunks most relevant to the question using a simple keyword-overlap score. Cap the total context.
4. **Answer (sonnet, streaming):** number the sources [1]..[n], with title, URL, published date, and text. The system prompt rules are:
   - Cite every factual claim inline.
   - Use only the provided sources.
   - Report conflicts between sources.
   - Lead with the direct answer.
   - Give dates for time-sensitive facts.
   - Apply the category persona and safety text.
   - If fewer than minSources usable sources exist, don't answer. Say what was found and what's missing.
5. **Verify (sonnet, JSON):** split the answer into claims. For each claim and its cited source text, return `supported | partial | unsupported`. Then:
   - Remove citation numbers that don't exist.
   - If any claim is unsupported, run one repair pass that rewrites only those sentences, either softening them with a citation or deleting them. Never loop more than once.
6. **Receipts:** compute a confidence level and an "as of" stamp, and return the full trace: `{ queries, sources[{id,url,title,published,readStatus,cited}], claims[{text,verdict,sourceIds}], confidence, asOf, newestSourceAge, timingsMs }`.

Confidence is **High** when all claims are supported, at least 2 independent domains are cited, and the newest source fits the category's freshness window. It's **Medium** when some claims are partial, and **Low** otherwise.

### Non-negotiables

- No answer from model memory alone. If search returns nothing, the bot says it couldn't verify and offers what to check.
- Every external payload is parsed with Zod.
- Timeouts and retries apply to every network call. Retry only on 429 and 5xx.
- Cache search and contents responses on disk in dev, keyed by request hash, to save credits while iterating.

## 5. MCP server (packages/mcp-server)

Tools, with clear descriptions because Claude picks tools by their descriptions:

| Tool | Input | Returns |
|---|---|---|
| `list_categories` | none | ids, names, descriptions |
| `live_answer` | question, category? (default auto) | answer markdown + receipts JSON |
| `search_category` | query, category, freshness? | ranked sources with snippets |
| `read_sources` | urls[] (max 5) | extracted text per URL |
| `fact_check` | claim, category? | verdict, evidence quotes, sources |

Return answers as text content that already includes a compact sources list, so the receipts survive in any client. Put the full receipts in a second content block.

Read `YDC_API_KEY` and `ANTHROPIC_API_KEY` from env, and fail with a clear message if either is missing.

## 6. Claude Code plugin (plugin/)

Follow the current Claude Code plugin docs. The manifest goes in `.claude-plugin/plugin.json` (kebab-case name is required). Components are auto-discovered from `commands/`, `agents/`, `skills/`, and `.mcp.json`. Use `${CLAUDE_PLUGIN_ROOT}` for every path inside the plugin.

- `.mcp.json`: launches `node ${CLAUDE_PLUGIN_ROOT}/server/index.js` and passes through `YDC_API_KEY` and `ANTHROPIC_API_KEY`. The build step copies the bundled MCP server into `plugin/server/`, bundled with tsup or esbuild into one file, so the plugin works without the monorepo.
- `commands/ask.md` handles `/ask <category> <question>` and calls `live_answer`. It prints the answer, then a sources table.
- `commands/categories.md` handles `/categories` and lists the categories with examples.
- `commands/factcheck.md` handles `/factcheck <claim>` and calls `fact_check`.
- `skills/live-answers/SKILL.md` tells Claude to use `live_answer` whenever a question depends on current facts (prices, versions, standings, news, laws, people's current roles) instead of answering from memory.
- `agents/fact-checker.md` is a subagent that takes a draft, extracts claims, calls `fact_check` on each, and returns a corrected draft with citations.
- Add a local marketplace file so judges can install the plugin in one command, and put the install steps in the README.

## 7. Web chatbot (apps/web)

- Layout: a category rail on the left (a scrollable chip row on mobile), the chat in the center, and a receipts drawer on the right.
- Each category keeps its own chat history in memory. History is not persisted.
- While the answer streams, show the live pipeline: "Searching 3 queries… Reading 5 sources… Checking 9 claims…". These steps double as the "study" moment.
- Citations [n] are hoverable chips that show the source title, domain, and date. Clicking one opens the receipts drawer to that source.
- Sentences marked partial or unsupported get a subtle underline with the verdict on hover.
- The answer footer shows the confidence badge, "As of <timestamp>", and "Newest source: 2 hours old".
- Add a "Compare with no search" toggle that also runs the bare model, side by side. This is the demo's money shot.
- API route `POST /api/answer` takes `{question, category}` and streams pipeline events as SSE.
- Rate limit per IP. Never expose API keys to the client.

## 8. Phases

Each phase ends with passing checks and a commit.

- **Phase 0 – Scaffold (1h).** Set up the workspaces, TS config, lint, Vitest, .env.example, and DECISIONS.md. ✅ `pnpm build && pnpm test` passes on empty packages.
- **Phase 1 – Providers (2h).** Build the You.com search and contents clients and the Claude wrapper, with Zod schemas, retries, and the dev disk cache. Add a script that calls each provider once. ✅ `pnpm --filter core smoke` prints real results. Unit tests with recorded fixtures pass.
- **Phase 2 – Categories + pipeline (4h).** Write all 12 category configs plus auto. Build plan, search ranking, read, answer, and verify with repair, plus receipts and confidence. Add a CLI command, `pnpm ask health "..."`. ✅ Tests cover ranking, dedupe, citation validation, and the refusal path. ✅ Three manual questions per category return cited answers.
- **Phase 3 – MCP server (1.5h).** Expose the 5 tools. ✅ They work in MCP Inspector. ✅ `live_answer` returns an answer with sources.
- **Phase 4 – Claude Code plugin (1.5h).** Build the manifest, .mcp.json, commands, skill, and agent, plus the bundling step and the marketplace file. ✅ A fresh Claude Code session installs the plugin from the local marketplace. ✅ `/ask gaming "..."` and `/factcheck "..."` work end to end.
- **Phase 5 – Evals (2h).** Write `evals/questions.jsonl` with about 5 questions per category that have checkable current answers, each with an `expected` field and a `checked_on` date. Write questions about things that change, like current versions, recent results, current officeholders, and current rates. The runner compares three systems: bare model, Studyhall, and the You.com Research API as a reference. Grade with an LLM judge plus exact-match where possible. Measure accuracy, citation validity, unsupported-claim rate, refusal rate, and latency. ✅ `pnpm eval` writes `evals/results.md` with a table.
- **Phase 6 – Web app (4h).** Build the UI described in section 7, with SSE streaming, the receipts drawer, and the compare toggle. ✅ Works on desktop and mobile widths. ✅ Keyboard accessible. ✅ No keys in client bundles.
- **Phase 7 – Polish + demo (2h).** Write the README with a GIF, architecture diagram, plugin install steps, and eval table. Deploy the web app (for example, Vercel with env vars), seed the demo questions, and write a 3-minute demo script.

## 9. Demo script (3 minutes)

1. Ask the bare model something that changed last week. It answers confidently and wrongly.
2. Ask Studyhall the same question in its category. Show the live study steps, the cited answer, and the "as of" stamp. Then open the receipts.
3. Ask something with conflicting sources. Studyhall shows the disagreement instead of picking a side silently.
4. Ask something with no good sources. Studyhall declines to guess.
5. Switch to Claude Code and run `/ask finance ...` and `/factcheck ...` with the plugin.
6. Show the eval table: accuracy on fresh questions, bare model vs Studyhall.

## 10. Risks and mitigations

- **API credits run out during the demo.** Keep the dev cache, add a "demo mode" that replays recorded runs, and pre-record a backup video.
- **Latency.** Run search in parallel and read in parallel. Stream the answer while verifying in the background. Verdict underlines appear when verification finishes.
- **Bad sources.** Use the per-category preferred and blocked domains and require at least 2 domains for High confidence.
- **Paywalls and JS-heavy pages.** Fall back to snippets and label those sources "snippets only".
- **API drift.** Zod parsing fails loudly. Check the schemas against the docs in Phase 1.

## 11. Stretch goals

- Category-specific data sources beyond web search, such as sports scores, market data, and patch-note feeds.
- A "follow this topic" option that re-runs a question daily and highlights what changed.
- Per-user preferred sources.
- A claude.ai connector by hosting the MCP server over HTTP.
