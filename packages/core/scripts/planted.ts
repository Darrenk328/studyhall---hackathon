/**
 * Planted-error check for verify: answer real questions live, then for each kind of error (number,
 * negation, entity) change one sentence the checker marked supported, keeping its citation, and
 * verify again. Every planted sentence should come back "unsupported".
 *   pnpm --filter core planted [--record] [--only finance,health]
 * --record writes test/fixtures/verify-planted-<kind>.json from the first success of each kind.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeClient, getCategory, loadEnv, noCache, ROLE_SETTINGS, YouClient } from "../src/index.js";
import { answerSystemPrompt, answerUserPrompt } from "../src/pipeline/answer.js";
import { planQueries } from "../src/pipeline/plan.js";
import { PLANTERS, type PlantKind } from "../src/pipeline/planting.js";
import { readSources, usableSources } from "../src/pipeline/read.js";
import { searchAll } from "../src/pipeline/search.js";
import { citedIds, squash } from "../src/pipeline/text.js";
import type { Claim, ReadSource } from "../src/pipeline/types.js";
import { normalizeClaims, VERIFY_SYSTEM, VerifySchema, verifyPrompt } from "../src/pipeline/verify.js";

const here = dirname(fileURLToPath(import.meta.url));
const record = process.argv.includes("--record");
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1]?.split(",") : undefined;
const KINDS: PlantKind[] = ["number", "negation", "entity"];
const CASES = [
  { categoryId: "finance", question: "What is the current federal funds rate target range?" },
  { categoryId: "health", question: "Who should get a flu shot this season, according to the CDC?" },
  { categoryId: "tech", question: "What is the current Node.js LTS version?" },
  { categoryId: "travel", question: "Do US citizens need ETIAS authorization to visit Europe now?" },
];

/** The words that differ between two sentences of the same shape. */
function changedWords(original: string, planted: string): string[] {
  const a = squash(original).split(" ");
  const b = squash(planted).split(" ");
  return b.filter((w) => !a.includes(w));
}

/** The checker's claim covering the planted change: part of the planted sentence, containing a changed word. */
function findPlantedClaim(claims: Claim[], original: string, planted: string): Claim | undefined {
  const changed = changedWords(original, planted);
  const p = squash(planted);
  const words = new Set(p.split(" "));
  const overlap = (t: string) => squash(t).split(" ").filter((w) => words.has(w)).length / Math.max(1, squash(t).split(" ").length);
  return (
    claims.find((c) => squash(c.text) === p) ??
    claims
      .filter((c) => changed.some((w) => squash(c.text).split(" ").includes(w)) && overlap(c.text) > 0.6)
      .sort((x, y) => overlap(y.text) - overlap(x.text))[0]
  );
}

interface Result {
  kind: PlantKind;
  categoryId: string;
  original: string;
  planted: string;
  verdict: string;
  note: string;
}

async function main() {
  loadEnv();
  const you = new YouClient({ cache: noCache });
  const claude = new ClaudeClient();
  const now = new Date();
  console.log(`verify model ${ROLE_SETTINGS.verify.model}, effort ${ROLE_SETTINGS.verify.effort}`);
  const results: Result[] = [];
  const recorded = new Set<PlantKind>();

  for (const c of CASES.filter((x) => !only || only.includes(x.categoryId))) {
    const category = getCategory(c.categoryId)!;
    const plan = await planQueries(claude, c.question, category, now);
    const found = await searchAll(you, plan.queries, category, now, { perQuery: 10, topN: 8 });
    const read = await readSources(you, found.candidates, c.question, { readK: 5, crawlTimeoutSec: 5, perSourceChars: 6000, totalChars: 30000 });
    const usable = usableSources(read.sources);
    const gen = claude.stream({ role: "answer", system: answerSystemPrompt(category, now), prompt: answerUserPrompt(c.question, usable) });
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    const answer = step.value.text;

    // Only the sources the answer cites, so fixtures stay small.
    const cited = new Set(citedIds(answer));
    const sources: ReadSource[] = usable.filter((s) => cited.has(s.id));
    const ids = new Set(sources.map((s) => s.id));
    const verify = (text: string) => claude.json({ role: "verify", system: VERIFY_SYSTEM, prompt: verifyPrompt(text, sources), schema: VerifySchema });

    const base = await verify(answer);
    const baseClaims = normalizeClaims(base.data.claims, ids);
    console.log(`\n[${c.categoryId}] ${c.question}  (${baseClaims.filter((x) => x.verdict === "supported").length} supported claims)`);

    for (const kind of KINDS) {
      const target = baseClaims.find((cl) => cl.verdict === "supported" && answer.includes(cl.text) && PLANTERS[kind](cl.text));
      if (!target) {
        console.log(`  ${kind.padEnd(8)} no supported claim to plant in; skipped`);
        continue;
      }
      const planted = PLANTERS[kind](target.text)!;
      const plantedAnswer = answer.replace(target.text, planted);
      const res = await verify(plantedAnswer);
      const claim = findPlantedClaim(normalizeClaims(res.data.claims, ids), target.text, planted);
      const verdict = claim?.verdict ?? "NOT FOUND";
      results.push({ kind, categoryId: c.categoryId, original: target.text, planted, verdict, note: claim?.note ?? "" });
      console.log(`  ${kind.padEnd(8)} ${verdict === "unsupported" ? "✓" : "✗"} ${verdict}`);
      console.log(`           was: ${target.text}`);
      console.log(`           now: ${planted}`);
      console.log(`           note: ${claim?.note ?? "-"}`);

      if (record && !recorded.has(kind) && verdict === "unsupported") {
        recorded.add(kind);
        const fixture = {
          kind,
          recordedAt: now.toISOString(),
          question: c.question,
          categoryId: c.categoryId,
          models: { answer: step.value.model, verify: res.model },
          verifyEffort: ROLE_SETTINGS.verify.effort,
          sources: sources.map(({ id, url, title, domain, published, readStatus, text }) => ({ id, url, title, domain, published, readStatus, text })),
          answer,
          originalSentence: target.text,
          plantedSentence: planted,
          plantedAnswer,
          verifyOriginal: base.data,
          verifyPlanted: res.data,
        };
        const file = join(here, "..", "test", "fixtures", `verify-planted-${kind}.json`);
        await writeFile(file, JSON.stringify(fixture, null, 2) + "\n");
        console.log(`           recorded ${file} (sources: ${[...new Set(sources.map((s) => s.domain))].join(", ")})`);
      }
    }
  }

  console.log("\nSummary");
  for (const kind of KINDS) {
    const rs = results.filter((r) => r.kind === kind);
    console.log(`  ${kind.padEnd(8)} ${rs.filter((r) => r.verdict === "unsupported").length}/${rs.length} unsupported  (${rs.map((r) => `${r.categoryId}:${r.verdict}`).join(", ")})`);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
