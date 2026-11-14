# Studyhall

A category-organized chatbot that studies before it answers: it searches the live web (You.com), reads the sources, answers only from what it read with inline citations, checks its own claims, and shows the receipts.

It has two surfaces on one engine: a web chatbot and a Claude Code plugin (MCP server, slash commands, skill, fact-checking subagent).

See [PLAN.md](PLAN.md) for the full build plan and [DECISIONS.md](DECISIONS.md) for deviations.

## Status

| Phase | Status |
|---|---|
| 0 Scaffold | ✅ done |
| 1 Providers | not started |
| 2 Categories + pipeline | not started |
| 3 MCP server | not started |
| 4 Claude Code plugin | not started |
| 5 Evals | not started |
| 6 Web app | not started |
| 7 Polish + demo | not started |

## Setup

Requires Node 20+ and pnpm 10.

```bash
pnpm install
cp .env.example .env   # fill in YDC_API_KEY and ANTHROPIC_API_KEY
pnpm build
pnpm test
pnpm lint
```

## Layout

```
packages/core        engine: categories, pipeline, providers (no UI)
packages/mcp-server  stdio MCP server exposing core as tools
apps/web             Next.js chat app (Phase 6)
plugin/              Claude Code plugin (Phase 4)
evals/               questions, runner, results (Phase 5)
```
