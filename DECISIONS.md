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
