/** Aggregate graded eval rows into the numbers for results.json / results.md and the About page. */
import type { Verdict } from "./grade.js";

export type SystemId = "A" | "B" | "C";
export const SYSTEM_NAMES: Record<SystemId, string> = {
  A: "Bare model (from memory)",
  B: "Studyhall",
  C: "You.com Research API (reference)",
};

export interface GradedRow {
  id: string;
  category: string;
  type: "time-sensitive" | "stable";
  system: SystemId;
  verdict: Verdict;
  termMatch: boolean;
  latencyMs: number;
  costUsd: number;
  /** Studyhall only. */
  studyhall?: {
    confidence: "high" | "medium" | "low";
    outcome: string;
    citations: number;
    removedCitations: number;
    gradedClaims: number;
    unsupportedClaims: number;
  };
  error?: string;
}

export interface Rates {
  n: number;
  correct: number;
  partial: number;
  wrong: number;
  declined: number;
  /** correct / n */
  accuracy: number;
  /** correct / (n - declined): accuracy when it answered. */
  accuracyWhenAnswered: number;
}

export function rates(rows: GradedRow[]): Rates {
  const n = rows.length;
  const c = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const correct = c("correct");
  const declined = c("declined");
  const answered = n - declined;
  return {
    n,
    correct: n ? correct / n : 0,
    partial: n ? c("partial") / n : 0,
    wrong: n ? c("wrong") / n : 0,
    declined: n ? declined / n : 0,
    accuracy: n ? correct / n : 0,
    accuracyWhenAnswered: answered ? correct / answered : 0,
  };
}

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface SystemResult extends Rates {
  system: SystemId;
  name: string;
  timeSensitive: Rates;
  stable: Rates;
  byCategory: Record<string, Rates>;
  medianLatencyMs: number;
  costPerQuestionUsd: number;
  /** Term match agreed with the judge (match ⇔ correct). */
  termJudgeAgreement: number;
  errors: number;
}

export interface StudyhallExtras {
  /** Citation markers that pointed at a real source, before clean-up. */
  citationValidity: number;
  /** Unsupported claims among graded (non-meta) claims, after the repair pass. */
  unsupportedClaimRate: number;
  /** Confidence badge × verdict counts: does High mean more accurate? */
  confidenceByVerdict: Record<"high" | "medium" | "low", Record<Verdict, number>>;
  /** Accuracy within each badge. */
  accuracyByConfidence: Record<"high" | "medium" | "low", { n: number; accuracy: number }>;
}

export interface PitchNumbers {
  /** Bare model, time-sensitive questions it answered (not declined): share graded wrong (and wrong or partial). */
  bareTimeSensitive: { answered: number; wrong: number; wrongRate: number; wrongOrPartial: number; wrongOrPartialRate: number };
  /** Questions the bare model got wrong or declined: how often each search system was correct on them. */
  afterBareMiss: { n: number; studyhallCorrect: number; studyhallRate: number; researchCorrect: number; researchRate: number };
}

export function pitchNumbers(rows: GradedRow[]): PitchNumbers {
  const by = (s: SystemId) => new Map(rows.filter((r) => r.system === s).map((r) => [r.id, r]));
  const [a, b, c] = [by("A"), by("B"), by("C")];
  const answered = [...a.values()].filter((r) => r.type === "time-sensitive" && r.verdict !== "declined");
  const wrong = answered.filter((r) => r.verdict === "wrong").length;
  const wrongOrPartial = answered.filter((r) => r.verdict === "wrong" || r.verdict === "partial").length;
  const missed = [...a.values()].filter((r) => r.verdict === "wrong" || r.verdict === "declined").map((r) => r.id);
  const correctOn = (m: Map<string, GradedRow>) => missed.filter((id) => m.get(id)?.verdict === "correct").length;
  const ratio = (x: number, n: number) => (n ? x / n : 0);
  return {
    bareTimeSensitive: { answered: answered.length, wrong, wrongRate: ratio(wrong, answered.length), wrongOrPartial, wrongOrPartialRate: ratio(wrongOrPartial, answered.length) },
    afterBareMiss: { n: missed.length, studyhallCorrect: correctOn(b), studyhallRate: ratio(correctOn(b), missed.length), researchCorrect: correctOn(c), researchRate: ratio(correctOn(c), missed.length) },
  };
}

export function summarize(rows: GradedRow[]): { systems: SystemResult[]; studyhall: StudyhallExtras; pitch: PitchNumbers } {
  const systems = (["A", "B", "C"] as SystemId[])
    .map((system) => {
      const rs = rows.filter((r) => r.system === system);
      if (!rs.length) return undefined;
      const cats = [...new Set(rs.map((r) => r.category))].sort();
      return {
        system,
        name: SYSTEM_NAMES[system],
        ...rates(rs),
        timeSensitive: rates(rs.filter((r) => r.type === "time-sensitive")),
        stable: rates(rs.filter((r) => r.type === "stable")),
        byCategory: Object.fromEntries(cats.map((c) => [c, rates(rs.filter((r) => r.category === c))])),
        medianLatencyMs: median(rs.filter((r) => !r.error).map((r) => r.latencyMs)),
        costPerQuestionUsd: rs.reduce((s, r) => s + r.costUsd, 0) / rs.length,
        termJudgeAgreement: rs.filter((r) => r.termMatch === (r.verdict === "correct")).length / rs.length,
        errors: rs.filter((r) => r.error).length,
      } satisfies SystemResult;
    })
    .filter((s): s is SystemResult => Boolean(s));

  const b = rows.filter((r) => r.system === "B" && r.studyhall);
  const cites = b.reduce((s, r) => s + r.studyhall!.citations, 0);
  const removed = b.reduce((s, r) => s + r.studyhall!.removedCitations, 0);
  const graded = b.reduce((s, r) => s + r.studyhall!.gradedClaims, 0);
  const unsupported = b.reduce((s, r) => s + r.studyhall!.unsupportedClaims, 0);
  const levels = ["high", "medium", "low"] as const;
  const verdicts: Verdict[] = ["correct", "partial", "wrong", "declined"];
  const confidenceByVerdict = Object.fromEntries(
    levels.map((l) => [l, Object.fromEntries(verdicts.map((v) => [v, b.filter((r) => r.studyhall!.confidence === l && r.verdict === v).length]))]),
  ) as StudyhallExtras["confidenceByVerdict"];
  const accuracyByConfidence = Object.fromEntries(
    levels.map((l) => {
      const rs = b.filter((r) => r.studyhall!.confidence === l);
      return [l, { n: rs.length, accuracy: rs.length ? rs.filter((r) => r.verdict === "correct").length / rs.length : 0 }];
    }),
  ) as StudyhallExtras["accuracyByConfidence"];
  return {
    systems,
    studyhall: {
      citationValidity: cites + removed ? cites / (cites + removed) : 1,
      unsupportedClaimRate: graded ? unsupported / graded : 0,
      confidenceByVerdict,
      accuracyByConfidence,
    },
    pitch: pitchNumbers(rows),
  };
}
