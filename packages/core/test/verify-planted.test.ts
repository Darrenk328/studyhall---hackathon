/**
 * Planted-error test for verify (recorded by `pnpm --filter core planted --record`).
 * A real answer about the federal funds rate had one number changed, keeping its citation.
 * The recorded checker output must flag that sentence unsupported, and the untouched answer must not be.
 * Set STUDYHALL_LIVE=1 to re-run the check against the live model.
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/verify-planted.json" with { type: "json" };
import { ClaudeClient } from "../src/providers/claude.js";
import { citedIds } from "../src/pipeline/text.js";
import type { Claim, ReadSource } from "../src/pipeline/types.js";
import { normalizeClaims, plantNumberError, squash, VerifySchema, verifyAnswer } from "../src/pipeline/verify.js";

// Parsing also checks the recorded model output still matches the current schema.
const verifyOriginal = VerifySchema.parse(fixture.verifyOriginal);
const verifyPlanted = VerifySchema.parse(fixture.verifyPlanted);
const ids = new Set(fixture.sources.map((s) => s.id));
const words = (s: string) => s.split(/\s+/);
const changedWord = words(fixture.plantedSentence).find((w, i) => w !== words(fixture.originalSentence)[i])!;
const changedNumber = changedWord.replace(/[^\d.]/g, "");

/** The claim covering the planted number: its text is part of the planted sentence and contains the new number. */
function plantedClaim(claims: Claim[]): Claim | undefined {
  return claims.find((c) => squash(fixture.plantedSentence).includes(squash(c.text)) && c.text.includes(changedNumber));
}

describe("planted-error fixture", () => {
  it("changes exactly one number and keeps the citations", () => {
    const diffs = words(fixture.plantedSentence).filter((w, i) => w !== words(fixture.originalSentence)[i]);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatch(/\d/);
    expect(citedIds(fixture.plantedSentence)).toEqual(citedIds(fixture.originalSentence));
    expect(citedIds(fixture.plantedSentence).length).toBeGreaterThan(0);
    expect(fixture.plantedAnswer).toBe(fixture.answer.replace(fixture.originalSentence, fixture.plantedSentence));
    expect(plantNumberError(fixture.originalSentence)).toBe(fixture.plantedSentence);
  });
});

describe("verify catches a planted error (recorded model output)", () => {
  it("does not flag the original sentence", () => {
    const claims = normalizeClaims(verifyOriginal.claims, ids);
    const original = claims.filter((c) => squash(fixture.originalSentence).includes(squash(c.text)));
    expect(original.length).toBeGreaterThan(0);
    expect(original.every((c) => c.verdict === "supported")).toBe(true);
  });

  it("flags the planted sentence as unsupported and names the conflict", () => {
    const claims = normalizeClaims(verifyPlanted.claims, ids);
    const planted = plantedClaim(claims);
    expect(planted, "the checker should return a claim for the planted sentence").toBeDefined();
    expect(planted!.verdict).toBe("unsupported");
    expect(planted!.sourceIds.length).toBeGreaterThan(0);
    // The note should mention the source's real value.
    const realNumber = words(fixture.originalSentence).find((w, i) => w !== words(fixture.plantedSentence)[i])!.replace(/[^\d.]/g, "");
    expect(planted!.note).toContain(realNumber);
  });

  it("leaves the other claims' verdicts unchanged", () => {
    const before = normalizeClaims(verifyOriginal.claims, ids);
    const after = normalizeClaims(verifyPlanted.claims, ids).filter((c) => c !== plantedClaim(normalizeClaims(verifyPlanted.claims, ids)));
    const unsupportedAfter = after.filter((c) => c.verdict === "unsupported" && !c.text.includes(changedNumber));
    expect(unsupportedAfter).toHaveLength(before.filter((c) => c.verdict === "unsupported").length);
  });
});

describe.runIf(process.env.STUDYHALL_LIVE === "1")("verify catches a planted error (live model)", () => {
  it("flags the planted sentence unsupported", { timeout: 120_000 }, async () => {
    const sources = fixture.sources.map((s) => ({ ...s, score: 0, foundBy: [], preferred: true, cited: true })) as ReadSource[];
    const { claims } = await verifyAnswer(new ClaudeClient(), fixture.plantedAnswer, sources);
    expect(plantedClaim(claims)?.verdict).toBe("unsupported");
  });
});
