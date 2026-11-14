/**
 * Eval grading (PLAN Phase 6): term match first, then a blind LLM judge. Pure helpers plus the
 * judge call; the runner lives in scripts/eval.ts.
 */
import { z } from "zod";
import type { LlmProvider } from "../pipeline/types.js";

export const EvalQuestion = z.object({
  id: z.string(),
  category: z.string(),
  type: z.enum(["time-sensitive", "stable"]),
  app: z.string().optional(),
  question: z.string(),
  expected: z.string(),
  accept: z.array(z.string()).min(1),
  /** When true, any one accept term is enough; otherwise all are required. */
  acceptAny: z.boolean().optional(),
  reject: z.array(z.string()).optional(),
  volatile: z.boolean(),
  sources: z.array(z.string()).min(1),
  checked_on: z.string(),
  notes: z.string(),
});
export type EvalQuestion = z.infer<typeof EvalQuestion>;

export type Verdict = "correct" | "partial" | "wrong" | "declined";

/** Lower-case, unify quotes and dashes, drop thousands separators and currency signs, collapse space. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[$£€]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface TermMatch {
  /** All required accept terms present (or any, with acceptAny) and no reject term present. */
  match: boolean;
  found: string[];
  missing: string[];
  rejected: string[];
}

export function termMatch(answer: string, q: Pick<EvalQuestion, "accept" | "acceptAny" | "reject">): TermMatch {
  const a = normalize(answer);
  const found = q.accept.filter((t) => a.includes(normalize(t)));
  const missing = q.accept.filter((t) => !found.includes(t));
  const rejected = (q.reject ?? []).filter((t) => t && a.includes(normalize(t)));
  const ok = q.acceptAny ? found.length > 0 : missing.length === 0;
  return { match: ok && rejected.length === 0, found, missing, rejected };
}

/**
 * What the judge sees: the answer's text only. Citation markers ([1], [[2]]), links, bare URLs,
 * trailing source lists and Studyhall's own labels are removed so the judge can't tell which
 * system wrote it.
 */
export function anonymize(answer: string): string {
  return answer
    .replace(/\[\[\d+(?:,\s*\d+)*]]/g, "")
    .replace(/\[\d+(?:,\s*\d+)*](?!\()/g, "")
    .replace(/\[([^\]]+)]\((https?:[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n#{0,3}\s*(sources|references|citations)\s*:?\s*\n[\s\S]*$/i, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const JudgeSchema = z.object({ verdict: z.enum(["correct", "partial", "wrong", "declined"]), reason: z.string() });

export const JUDGE_SYSTEM = [
  "You grade one answer to a factual question against an expected answer that was verified from official sources on the stated date.",
  "You don't know which system wrote the answer, and it doesn't matter. Judge only the facts that answer the question.",
].join(" ");

export function judgePrompt(q: EvalQuestion, answer: string): string {
  return [
    `Question: ${q.question}`,
    `Expected answer (verified ${q.checked_on}): ${q.expected}`,
    `Grading notes: ${q.notes}`,
    "",
    `Answer to grade:\n<<<\n${anonymize(answer) || "(empty)"}\n>>>`,
    "",
    "Verdicts:",
    "- correct: the answer gives the expected fact (wording can differ; extra accurate detail is fine).",
    "- partial: the answer gets part of it right but is incomplete, imprecise, or has a minor error alongside the right fact.",
    "- wrong: the answer gives a different answer, an outdated value, or a materially wrong fact as its answer.",
    "- declined: the answer doesn't commit to an answer (says it can't find, verify or know it, or only tells the reader where to look). If it hedges but still gives an answer, grade that answer instead.",
    "Return the verdict and one short sentence explaining it.",
  ].join("\n");
}

export async function judge(claude: LlmProvider, q: EvalQuestion, answer: string): Promise<{ verdict: Verdict; reason: string; model: string; usage: { inputTokens: number; outputTokens: number } }> {
  const res = await claude.json({ role: "judge", system: JUDGE_SYSTEM, prompt: judgePrompt(q, answer), schema: JudgeSchema });
  return { verdict: res.data.verdict, reason: res.data.reason.trim(), model: res.model, usage: res.usage };
}
