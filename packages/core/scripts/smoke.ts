/**
 * Phase 1 smoke test: call each provider once against the live APIs.
 *   pnpm --filter core smoke            # live calls, prints results
 *   pnpm --filter core smoke --record   # also writes trimmed fixtures to test/fixtures/
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ClaudeClient,
  YouClient,
  fetchJson,
  loadEnv,
  noCache,
  parsePageAge,
  requireEnv,
  CONTENTS_URL,
  SEARCH_URL,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const record = process.argv.includes("--record");
const QUERY = "latest Node.js LTS release";

function ok(label: string, detail: string) {
  console.log(`  ✓ ${label}: ${detail}`);
}

async function main() {
  const envFile = loadEnv();
  console.log(`env: ${envFile ?? "(no .env found, using process env)"}`);

  // ---------- You.com search ----------
  console.log("\nYou.com search");
  const you = new YouClient({ cache: noCache });
  let t = Date.now();
  const hits = await you.search({ query: QUERY, count: 5, freshness: "month" });
  ok("results", `${hits.length} in ${Date.now() - t}ms`);
  for (const h of hits.slice(0, 5)) {
    const age = parsePageAge(h.pageAge);
    console.log(`    [${h.rank}] ${h.title}\n        ${h.url}  (${age ? age.toISOString().slice(0, 10) : "no date"})`);
  }
  if (hits.length === 0) throw new Error("search returned no results");

  // ---------- You.com contents ----------
  console.log("\nYou.com contents");
  const urls = [hits[0]!.url, "https://example.invalid/studyhall-smoke-missing"];
  t = Date.now();
  const pages = await you.contents(urls);
  ok("pages", `${pages.length} in ${Date.now() - t}ms`);
  for (const p of pages) {
    console.log(`    ${p.status.padEnd(7)} ${p.url}  ${p.markdown ? `${p.markdown.length} chars` : ""}`);
  }
  console.log(`    excerpt: ${pages[0]?.markdown?.slice(0, 160).replace(/\s+/g, " ")}…`);

  // ---------- Claude ----------
  console.log("\nClaude");
  const claude = new ClaudeClient();
  t = Date.now();
  const plan = await claude.json({
    role: "plan",
    system: "You write web search queries.",
    prompt: `Today is ${new Date().toISOString().slice(0, 10)}. Write 2 search queries for: "${QUERY}".`,
    schema: z.object({ queries: z.array(z.string()) }),
  });
  ok(`json (${claude.settingsFor("plan").model})`, `${JSON.stringify(plan.data.queries)} in ${Date.now() - t}ms`);

  t = Date.now();
  process.stdout.write(`  … stream (${claude.settingsFor("answer").model}): `);
  const gen = claude.stream({
    role: "answer",
    system: "Answer in one sentence using only the source. Cite it as [1].",
    prompt: `[1] ${hits[0]!.title} (${hits[0]!.url})\n${(pages[0]?.markdown ?? hits[0]!.description).slice(0, 4000)}\n\nQuestion: ${QUERY}?`,
    maxTokens: 2_000,
  });
  let step = await gen.next();
  while (!step.done) {
    process.stdout.write(step.value);
    step = await gen.next();
  }
  const final = step.value;
  console.log(
    `\n  ✓ stream: ${final.usage.outputTokens} output tokens in ${Date.now() - t}ms` +
      (final.failedOver ? ` (failed over to ${final.model})` : ""),
  );

  if (record) await recordFixtures(urls);
  console.log("\nsmoke OK");
}

/** Save raw provider responses (page text trimmed) for unit tests. */
async function recordFixtures(urls: string[]) {
  const dir = join(here, "..", "test", "fixtures");
  await mkdir(dir, { recursive: true });
  const headers = { "X-API-Key": requireEnv("YDC_API_KEY") };
  const search = (await fetchJson({ url: SEARCH_URL, headers, body: { query: QUERY, count: 5, freshness: "month" } })) as {
    results: { web?: { snippets?: string[]; description?: string }[] };
  };
  for (const r of search.results.web ?? []) {
    r.snippets = r.snippets?.slice(0, 2).map((s) => s.slice(0, 200));
    r.description = r.description?.slice(0, 200);
  }
  const contents = (await fetchJson({
    url: CONTENTS_URL,
    headers,
    body: { urls, formats: ["markdown", "metadata"], crawl_timeout: 10 },
  })) as { markdown?: string | null }[];
  for (const c of contents) if (c.markdown) c.markdown = c.markdown.slice(0, 600);
  await writeFile(join(dir, "you-search.json"), JSON.stringify(search, null, 2) + "\n");
  await writeFile(join(dir, "you-contents.json"), JSON.stringify(contents, null, 2) + "\n");
  console.log(`\nrecorded fixtures in ${dir}`);
}

main().catch((err: unknown) => {
  console.error(`\nsmoke FAILED: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
  process.exit(1);
});
