import { describe, expect, it, vi } from "vitest";
import { median, rates, summarize, type GradedRow } from "../src/evals/aggregate.js";
import { anonymize, judge, judgePrompt, normalize, termMatch, type EvalQuestion } from "../src/evals/grade.js";
import type { LlmProvider } from "../src/pipeline/types.js";
import { parseVerdict, spotcheckAgreement } from "../src/evals/spotcheck.js";

const q: EvalQuestion = {
  id: "x",
  category: "finance",
  type: "time-sensitive",
  question: "What is the 2027 401(k) limit?",
  expected: "$25,500",
  accept: ["25,500"],
  reject: ["24,500 for 2027"],
  volatile: false,
  sources: ["https://irs.gov"],
  checked_on: "2026-11-13",
  notes: "",
};

describe("term match", () => {
  it("normalizes numbers, currency, quotes and dashes", () => {
    expect(normalize("It’s $25,500 — up")).toBe("it's 25500 - up");
    expect(termMatch("The limit is $25500 [1].", q).match).toBe(true);
    expect(termMatch("The limit is 24,500 for 2027.", q)).toMatchObject({ match: false, rejected: ["24,500 for 2027"] });
  });
  it("requires all terms unless acceptAny", () => {
    const multi = { accept: ["Kagan", "Soai"] };
    expect(termMatch("Kagan won.", multi).match).toBe(false);
    expect(termMatch("Kagan won.", { ...multi, acceptAny: true }).match).toBe(true);
  });
});

describe("blind judge input", () => {
  it("strips citations, links, URLs and source lists", () => {
    const a = "It is $25,500 [1][2] per [IRS](https://irs.gov/x) and [[3]].\nSee https://irs.gov.\n\nSources:\n1. irs.gov";
    const out = anonymize(a);
    expect(out).not.toMatch(/\[|https?:|Sources/);
    expect(out).toContain("It is $25,500 per IRS and.");
  });
  it("never names a system and passes the verdict through", async () => {
    const p = judgePrompt(q, "Studyhall answer [1]");
    expect(p).not.toMatch(/\[1]/);
    expect(p).not.toMatch(/You\.com|bare model|from memory/i);
    const claude = { json: vi.fn(async () => ({ data: { verdict: "wrong", reason: " Old value. " }, model: "m", usage: { inputTokens: 1, outputTokens: 2 }, failedOver: false })) } as unknown as LlmProvider;
    expect(await judge(claude, q, "24,500")).toMatchObject({ verdict: "wrong", reason: "Old value." });
  });
});

describe("aggregate", () => {
  const row = (system: GradedRow["system"], verdict: GradedRow["verdict"], extra: Partial<GradedRow> = {}): GradedRow => ({
    id: "x", category: "finance", type: "time-sensitive", system, verdict, termMatch: verdict === "correct", latencyMs: 1000, costUsd: 0.01, ...extra,
  });
  it("reports declines separately: they never count as correct or wrong", () => {
    const r = rates([row("A", "correct"), row("A", "declined"), row("A", "wrong"), row("A", "partial")]);
    expect(r).toMatchObject({ n: 4, accuracy: 0.25, declined: 0.25, wrong: 0.25, accuracyWhenAnswered: 1 / 3 });
  });
  it("medians, splits and Studyhall extras", () => {
    expect(median([3, 1, 2, 10])).toBe(2.5);
    const sh = (c: "high" | "low", cites: number, removed: number, graded: number, unsup: number) => ({ confidence: c, outcome: "answered", citations: cites, removedCitations: removed, gradedClaims: graded, unsupportedClaims: unsup });
    const s = summarize([
      row("B", "correct", { studyhall: sh("high", 3, 0, 4, 0) }),
      row("B", "wrong", { type: "stable", studyhall: sh("low", 1, 1, 2, 1) }),
      row("A", "wrong"),
    ]);
    expect(s.systems.map((x) => x.system)).toEqual(["A", "B"]);
    const b = s.systems[1]!;
    expect(b.timeSensitive.accuracy).toBe(1);
    expect(b.stable.accuracy).toBe(0);
    expect(s.studyhall.citationValidity).toBe(0.8);
    expect(s.studyhall.unsupportedClaimRate).toBeCloseTo(1 / 6);
    expect(s.studyhall.accuracyByConfidence.high).toEqual({ n: 1, accuracy: 1 });
    expect(s.studyhall.confidenceByVerdict.low.wrong).toBe(1);
  });
});

describe("spot-check agreement", () => {
  const md = [
    "# Human spot-check", "",
    "## 1. a (system B: Studyhall)", "**Judge verdict:** correct. Fine.", "**Human verdict:** Correct ✓", "",
    "## 2. b (system A: Bare model (from memory))", "**Judge verdict:** declined. No answer.", "**Human verdict:** partially correct", "",
    "## 3. c (system C: You.com Research API (reference))", "**Judge verdict:** wrong. Old.", "**Human verdict:** ______", "",
  ].join("\n");
  it("reads human verdicts, skips blanks and counts agreement", () => {
    const s = spotcheckAgreement(md);
    expect(s).toMatchObject({ total: 3, graded: 2, agree: 1, agreement: 0.5 });
    expect(s.disagreements).toEqual([{ id: "b", system: "A", judge: "declined", human: "partial" }]);
    expect(parseVerdict("WRONG (outdated)")).toBe("wrong");
    expect(parseVerdict("incorrect")).toBe("wrong");
    expect(parseVerdict("refused")).toBe("declined");
  });
});

describe("pitch numbers", () => {
  const r = (system: "A" | "B" | "C", id: string, verdict: "correct" | "partial" | "wrong" | "declined", type: "time-sensitive" | "stable" = "time-sensitive"): GradedRow => ({ id, category: "x", type, system, verdict, termMatch: false, latencyMs: 1, costUsd: 0 });
  it("bare-model wrong rate counts only answered time-sensitive questions; recovery is measured on its misses", () => {
    const p = summarize([
      r("A", "1", "wrong"), r("A", "2", "declined"), r("A", "3", "correct"), r("A", "4", "partial"), r("A", "5", "wrong", "stable"),
      r("B", "1", "correct"), r("B", "2", "partial"), r("B", "3", "correct"), r("B", "4", "correct"), r("B", "5", "correct"),
      r("C", "1", "correct"), r("C", "2", "correct"), r("C", "3", "correct"), r("C", "4", "correct"), r("C", "5", "correct"),
    ]).pitch;
    expect(p.bareTimeSensitive).toEqual({ answered: 3, wrong: 1, wrongRate: 1 / 3, wrongOrPartial: 2, wrongOrPartialRate: 2 / 3 });
    expect(p.afterBareMiss).toMatchObject({ n: 3, studyhallCorrect: 2, researchCorrect: 3 });
  });
});
