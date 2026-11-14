/**
 * Compare mode (PLAN §6): the same answer model and persona with no sources ("From memory,
 * unverified"), and a cheap check of where that memory answer disagrees with Studyhall's verified
 * claims.
 */
import { z } from "zod";
import type { Category } from "../categories/types.js";
import type { TextResult } from "../providers/claude.js";
import { isoDate } from "./text.js";
import type { LlmProvider, Receipts } from "./types.js";

export function memorySystemPrompt(category: Category, now: Date): string {
  return [
    category.persona,
    `Today's date is ${isoDate(now)}.`,
    "Answer the question from your own knowledge. You have no sources and can't search the web.",
    "Lead with the direct answer and keep it short: two to five sentences, or a short list.",
    ...(category.safety ? [`Safety: ${category.safety}`] : []),
  ].join("\n");
}

/** Stream the no-sources answer. Same answer model and settings as Studyhall's answer step. */
export function memoryAnswer(claude: LlmProvider, question: string, category: Category, now: Date, signal?: AbortSignal): AsyncGenerator<string, TextResult> {
  return claude.stream({ role: "answer", system: memorySystemPrompt(category, now), prompt: question, ...(signal ? { signal } : {}) });
}

export interface Difference {
  /** What the memory answer said. */
  memory: string;
  /** What Studyhall's sources say. */
  sources: string;
  sourceIds: number[];
}

export interface WhereTheyDiffer {
  agree: boolean;
  differences: Difference[];
  model: string;
}

const DifferSchema = z.object({
  agree: z.boolean(),
  differences: z.array(z.object({ memory: z.string(), sources: z.string(), sourceIds: z.array(z.number()) })),
});

/** The verified claims Studyhall's answer rests on (supported or partial, not meta, not code). */
export function verifiedClaims(r: Receipts) {
  return r.claims.filter((c) => (c.verdict === "supported" || c.verdict === "partial") && c.kind !== "code" && c.sourceIds.length);
}

/**
 * One cheap Haiku call: up to 3 specific places where the memory answer disagrees with the
 * verified claims, each with what the sources say and their ids. Ids are checked against the
 * receipts; differences with no valid id are dropped.
 */
export async function whereTheyDiffer(
  claude: LlmProvider,
  question: string,
  memory: string,
  receipts: Receipts,
  signal?: AbortSignal,
): Promise<WhereTheyDiffer> {
  const claims = verifiedClaims(receipts);
  const res = await claude.json({
    role: "compare",
    system:
      "You compare an answer written from memory against facts verified from sources. Report only real disagreements about facts (a different number, date, name, version, function, or a yes/no flip), not differences in wording or detail.",
    prompt: [
      `Question: ${question}`,
      "",
      `Answer from memory (unverified):\n${memory}`,
      "",
      `Verified claims (each with the source ids that support it):\n${claims.map((c) => `- ${c.text} [sources: ${c.sourceIds.join(", ")}]`).join("\n")}`,
      "",
      "Return agree: true if the memory answer doesn't contradict any verified claim; otherwise false.",
      "Return up to 3 differences, most important first. For each: memory = what the memory answer said (short paraphrase or quote); sources = what the verified claims say instead (short); sourceIds = the ids of the verified claims you relied on. If they agree, return no differences.",
    ].join("\n"),
    schema: DifferSchema,
    ...(signal ? { signal } : {}),
  });
  const valid = new Set(receipts.sources.map((s) => s.id));
  const differences = res.data.differences
    .map((d) => ({ memory: d.memory.trim(), sources: d.sources.trim(), sourceIds: [...new Set(d.sourceIds.filter((n) => valid.has(n)))].sort((a, b) => a - b) }))
    .filter((d) => d.memory && d.sources && d.sourceIds.length)
    .slice(0, 3);
  return { agree: differences.length === 0 && res.data.agree, differences, model: res.model };
}
