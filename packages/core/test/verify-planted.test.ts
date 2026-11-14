/**
 * Planted-error tests for verify (recorded by `pnpm --filter core planted --record`).
 * Real answers had one error planted, keeping the citation: a changed number, a flipped negation
 * ("recommends" -> "does not recommend"), or a swapped organization. The recorded checker output
 * must flag the planted sentence unsupported, and must not flag the untouched sentence.
 * Set STUDYHALL_LIVE=1 to re-run each check against the live model.
 */
import { describe, expect, it } from "vitest";
import entity from "./fixtures/verify-planted-entity.json" with { type: "json" };
import negation from "./fixtures/verify-planted-negation.json" with { type: "json" };
import number from "./fixtures/verify-planted-number.json" with { type: "json" };
import { ClaudeClient } from "../src/providers/claude.js";
import { PLANTERS, type PlantKind } from "../src/pipeline/planting.js";
import { citedIds, squash } from "../src/pipeline/text.js";
import type { Claim, ReadSource } from "../src/pipeline/types.js";
import { normalizeClaims, VerifySchema, verifyAnswer } from "../src/pipeline/verify.js";

const FIXTURES = [number, negation, entity];

/** Words present in the planted sentence but not in the original (what the checker must catch). */
const changedWords = (original: string, planted: string) => {
  const a = squash(original).split(" ");
  return squash(planted).split(" ").filter((w) => !a.includes(w));
};

/** The checker's claim covering the planted change. */
function plantedClaim(claims: Claim[], original: string, planted: string): Claim | undefined {
  const changed = changedWords(original, planted);
  const p = squash(planted);
  return claims.find((c) => squash(c.text) === p) ?? claims.find((c) => p.includes(squash(c.text)) && changed.some((w) => squash(c.text).split(" ").includes(w)));
}

describe.each(FIXTURES.map((f) => [f.kind, f] as const))("planted %s error", (kind, f) => {
  const ids = new Set(f.sources.map((s) => s.id));
  // Parsing also checks the recorded model output still matches the current schema.
  const original = normalizeClaims(VerifySchema.parse(f.verifyOriginal).claims, ids);
  const planted = normalizeClaims(VerifySchema.parse(f.verifyPlanted).claims, ids);

  it("fixture: one planted change, citations kept, reproducible", () => {
    expect(PLANTERS[kind as PlantKind](f.originalSentence)).toBe(f.plantedSentence);
    expect(changedWords(f.originalSentence, f.plantedSentence).length).toBeGreaterThan(0);
    expect(citedIds(f.plantedSentence)).toEqual(citedIds(f.originalSentence));
    expect(citedIds(f.plantedSentence).length).toBeGreaterThan(0);
    expect(f.plantedAnswer).toBe(f.answer.replace(f.originalSentence, f.plantedSentence));
  });

  it("the original sentence is not flagged", () => {
    const covering = original.filter((c) => squash(f.originalSentence).includes(squash(c.text)));
    expect(covering.length).toBeGreaterThan(0);
    expect(covering.every((c) => c.verdict === "supported")).toBe(true);
  });

  it("the planted sentence is graded unsupported", () => {
    const c = plantedClaim(planted, f.originalSentence, f.plantedSentence);
    expect(c, "the checker should return a claim for the planted sentence").toBeDefined();
    expect(c!.verdict).toBe("unsupported");
    expect(c!.sourceIds.length).toBeGreaterThan(0);
  });

  it("no other claim newly becomes unsupported", () => {
    const target = plantedClaim(planted, f.originalSentence, f.plantedSentence);
    const before = original.filter((c) => c.verdict === "unsupported").length;
    const after = planted.filter((c) => c !== target && c.verdict === "unsupported").length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it.runIf(process.env.STUDYHALL_LIVE === "1")("live: the planted sentence is graded unsupported", { timeout: 120_000 }, async () => {
    const sources = f.sources.map((s) => ({ ...s, score: 0, foundBy: [], preferred: true, authority: true, cited: true })) as ReadSource[];
    const { claims } = await verifyAnswer(new ClaudeClient(), f.plantedAnswer, sources);
    expect(plantedClaim(claims, f.originalSentence, f.plantedSentence)?.verdict).toBe("unsupported");
  });
});
