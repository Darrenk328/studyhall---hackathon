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
- **Refusal fallback:** Sonnet calls send `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). Haiku 5.5 has no server-side fallback, so it gets none. All calls go through `client.beta.messages`.
- **Structured JSON** uses `beta.messages.parse` with `betaZodOutputFormat`, not prompt-and-parse.
- **Retries for Claude** use the SDK's built-in policy (2 retries on 408/409/429/5xx and connection errors). This is slightly broader than "429 and 5xx only", which our own HTTP layer (`net/http.ts`) applies to You.com.

Testing:

- **Fixtures** in `packages/core/test/fixtures/` are real You.com responses recorded by `pnpm smoke --record`, with page text and snippets trimmed.
- **Dev cache** stores the raw response before parsing, so Zod checks still run on cache hits. Its directory resolves against the repo root (where `.env` lives).
