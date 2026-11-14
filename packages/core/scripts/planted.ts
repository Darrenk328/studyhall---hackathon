/**
 * Planted-error check for verify: answer a real question live, change one number in a sentence
 * the checker marked supported (keeping its citation), and verify again.
 *   pnpm --filter core planted [--record]
 * --record writes test/fixtures/verify-planted.json from the first question.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeClient, getCategory, loadEnv, noCache, YouClient } from "../src/index.js";
import { answerSystemPrompt, answerUserPrompt } from "../src/pipeline/answer.js";
import { planQueries } from "../src/pipeline/plan.js";
import { readSources, usableSources } from "../src/pipeline/read.js";
import { searchAll } from "../src/pipeline/search.js";
import { citedIds } from "../src/pipeline/text.js";
import type { ReadSource } from "../src/pipeline/types.js";
import { normalizeClaims, plantNumberError, squash, VERIFY_SYSTEM, VerifySchema, verifyPrompt } from "../src/pipeline/verify.js";

const here = dirname(fileURLToPath(import.meta.url));
const record = process.argv.includes("--record");
const CASES = [
  { categoryId: "finance", question: "What is the current federal funds rate target range?" },
  { categoryId: "tech", question: "What is the current Node.js LTS version?" },
  { categoryId: "health", question: "Who should get a flu shot this season, according to the CDC?" },
];

async function main() {
  loadEnv();
  const you = new YouClient({ cache: noCache });
  const claude = new ClaudeClient();
  const now = new Date();
  let recorded = false;

  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1]?.split(",") : undefined;
  for (const c of CASES.filter((x) => !only || only.includes(x.categoryId))) {
    const category = getCategory(c.categoryId)!;
    const plan = await planQueries(claude, c.question, category, now);
    const found = await searchAll(you, plan.queries, category, now, { perQuery: 10, topN: 8 });
    const read = await readSources(you, found.candidates, c.question, { readK: 5, perSourceChars: 6000, totalChars: 30000 });
    const usable = usableSources(read.sources);
    const gen = claude.stream({ role: "answer", system: answerSystemPrompt(category, now), prompt: answerUserPrompt(c.question, usable) });
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    const answer = step.value.text;
    const answerModel = step.value.model;

    // Only the sources the answer cites, so the fixture stays small.
    const cited = new Set(citedIds(answer));
    const sources: ReadSource[] = usable.filter((s) => cited.has(s.id));
    const verify = async (text: string) =>
      claude.json({ role: "verify", system: VERIFY_SYSTEM, prompt: verifyPrompt(text, sources), schema: VerifySchema });

    const base = await verify(answer);
    const baseClaims = normalizeClaims(base.data.claims, new Set(sources.map((s) => s.id)));
    const target = baseClaims.find((cl) => cl.verdict === "supported" && answer.includes(cl.text) && plantNumberError(cl.text));
    if (!target) {
      console.log(`\n[${c.categoryId}] no supported claim with a number to plant; skipped`);
      continue;
    }
    const plantedSentence = plantNumberError(target.text)!;
    const plantedAnswer = answer.replace(target.text, plantedSentence);
    const res = await verify(plantedAnswer);
    const claims = normalizeClaims(res.data.claims, new Set(sources.map((s) => s.id)));
    // The checker may split or trim sentences; match exactly, then by the planted number plus word overlap.
    const changed = plantedSentence.split(/\s+/).find((w, i) => w !== target.text.split(/\s+/)[i]) ?? "";
    const words = new Set(squash(plantedSentence).split(" "));
    const overlap = (t: string) => squash(t).split(" ").filter((w) => words.has(w)).length / Math.max(1, squash(t).split(" ").length);
    const hit =
      claims.find((cl) => squash(cl.text) === squash(plantedSentence)) ??
      claims.filter((cl) => cl.text.includes(changed.replace(/[^\d.,]/g, "")) && overlap(cl.text) > 0.6).sort((a, b) => overlap(b.text) - overlap(a.text))[0];

    console.log(`\n[${c.categoryId}] ${c.question}`);
    console.log(`  original: ${target.text}`);
    console.log(`  planted:  ${plantedSentence}`);
    console.log(`  baseline verdict: ${target.verdict}`);
    console.log(`  planted verdict:  ${hit ? `${hit.verdict} — ${hit.note}` : "NOT FOUND among claims"}`);
    const others = claims.filter((cl) => cl !== hit);
    console.log(`  other claims: ${others.filter((x) => x.verdict === "supported").length} supported, ${others.filter((x) => x.verdict !== "supported").length} not`);

    if (record && !recorded) {
      recorded = true;
      const fixture = {
        recordedAt: now.toISOString(),
        question: c.question,
        categoryId: c.categoryId,
        models: { answer: answerModel, verify: res.model },
        sources: sources.map(({ id, url, title, domain, published, readStatus, text }) => ({ id, url, title, domain, published, readStatus, text })),
        answer,
        originalSentence: target.text,
        plantedSentence,
        plantedAnswer,
        verifyOriginal: base.data,
        verifyPlanted: res.data,
      };
      const file = join(here, "..", "test", "fixtures", "verify-planted.json");
      await writeFile(file, JSON.stringify(fixture, null, 2) + "\n");
      console.log(`  recorded ${file} (sources: ${sources.map((s) => s.domain).join(", ")})`);
    }
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
