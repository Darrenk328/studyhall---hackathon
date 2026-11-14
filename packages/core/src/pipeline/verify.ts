import { z } from "zod";
import { formatSources } from "./answer.js";
import { locateSpan, splitSentences, squash } from "./text.js";
import type { Claim, LlmProvider, ReadSource, RepairEdit } from "./types.js";

const RawClaim = z.object({
  text: z.string(),
  sourceIds: z.array(z.number()),
  /** True when any detail in the sentence conflicts with the cited sources. Forces "unsupported". */
  contradicted: z.boolean(),
  verdict: z.enum(["supported", "partial", "unsupported", "meta"]),
  note: z.string(),
  evidence: z.string(),
});

export const VerifySchema = z.object({ claims: z.array(RawClaim) });

const RepairSchema = z.object({
  answer: z.string(),
  edits: z.array(
    z.object({
      original: z.string(),
      action: z.enum(["softened", "cited", "removed"]),
      /** The new sentence exactly as it appears in the revised answer; empty when removed. */
      revised: z.string(),
    }),
  ),
});

export const VERIFY_SYSTEM = [
  "You are a strict fact-checker. You check an answer against the numbered sources it cites.",
  "Judge only against the source text provided, never against your own knowledge.",
].join(" ");

const FIELD_RULES = [
  "- sourceIds: the citation numbers attached to that sentence (empty if none).",
  "- contradicted: true if any detail in the sentence (a number, date, name, organization, version, place, or whether something is or isn't recommended, required or allowed) conflicts with what the cited sources say. Check every detail individually.",
  "- verdict:",
  "  - \"supported\": every fact in the sentence is stated in the cited sources.",
  "  - \"partial\": nothing in the sentence conflicts with the sources, but some detail isn't covered by them, or the wording is broader or less precise than the source.",
  "  - \"unsupported\": any detail is contradicted by the cited sources, the main point isn't in the cited sources, or the sentence has no citation. One wrong number, date, name or negation makes the whole sentence unsupported, even if the rest is right.",
  "  - \"meta\": the sentence is about the sources or the answer itself rather than the topic. That includes: a source's date, recency or completeness (\"this is the newest guidance in the sources\", \"that snippet is partial\", \"these pages appear older\"); which source to prefer and why (\"so I'd go with the newer recommendation\"); what the sources do or don't cover; statements of the answer's scope or disclaimers (\"this covers EU law only\", \"this is general information, not legal advice\"); and general advice to consult a professional. A sentence that reports what a source says about the topic (\"The CDC page says X [1]\", \"Sources disagree: [1] says X, [2] says Y\") is NOT meta and must be graded. If a sentence mixes a topic fact with commentary about the sources, grade the topic fact.",
  "- evidence: a short quote (25 words or fewer) from a cited source that supports the claim, or an empty string.",
  "- note: one short sentence explaining the verdict.",
].join("\n");

export function verifyPrompt(answer: string, sources: ReadSource[]): string {
  return [
    `Sources:\n\n${formatSources(sources)}`,
    "===",
    `Answer to check:\n\n${answer}`,
    "===",
    "Split the answer into its claims, usually one per sentence. Skip sentences with no factual content, such as a closing line advising the reader to see a professional.",
    "For each claim return:",
    "- text: the sentence copied exactly from the answer, including its citation markers.",
    FIELD_RULES,
  ].join("\n\n");
}

export function reverifyPrompt(sentences: string[], sources: ReadSource[]): string {
  return [
    `Sources:\n\n${formatSources(sources)}`,
    "===",
    `Sentences to check:\n\n${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    "===",
    "Return exactly one claim per numbered sentence, in the same order.",
    "- text: the sentence copied exactly, including its citation markers.",
    FIELD_RULES,
  ].join("\n\n");
}

/**
 * Deterministic checks on the model's verdicts: unknown ids are dropped; a contradiction always
 * means unsupported; a non-meta claim with no valid citation is unsupported. Spans are set later.
 */
export function normalizeClaims(raw: z.infer<typeof RawClaim>[], validIds: ReadonlySet<number>): Claim[] {
  return raw.map((c) => {
    const sourceIds = [...new Set(c.sourceIds.filter((n) => validIds.has(n)))].sort((a, b) => a - b);
    const base = { text: c.text.trim(), sourceIds, evidence: c.evidence.trim().slice(0, 300), span: null };
    if (c.contradicted) {
      const note = c.verdict === "unsupported" ? c.note.trim() : `Contradicted by the cited source. ${c.note.trim()}`;
      return { ...base, verdict: "unsupported", note };
    }
    if (c.verdict === "meta") return { ...base, verdict: "meta", note: c.note.trim() };
    if (sourceIds.length === 0) {
      return { ...base, verdict: "unsupported", note: c.verdict === "unsupported" ? c.note.trim() : "No valid citation." };
    }
    return { ...base, verdict: c.verdict, note: c.note.trim() };
  });
}

/** Set each claim's span in `answer`. */
export function locateClaims(answer: string, claims: Claim[]): Claim[] {
  return claims.map((c) => ({ ...c, span: locateSpan(answer, c.text) }));
}

export async function verifyAnswer(
  claude: LlmProvider,
  answer: string,
  sources: ReadSource[],
): Promise<{ claims: Claim[]; model: string }> {
  const res = await claude.json({ role: "verify", system: VERIFY_SYSTEM, prompt: verifyPrompt(answer, sources), schema: VerifySchema });
  return { claims: locateClaims(answer, normalizeClaims(res.data.claims, new Set(sources.map((s) => s.id)))), model: res.model };
}

/**
 * The single repair pass (PLAN.md §4 step 5): rewrite only the unsupported sentences, softening
 * them with a citation or deleting them. Called at most once per answer.
 */
export async function repairAnswer(
  claude: LlmProvider,
  answer: string,
  unsupported: Claim[],
  sources: ReadSource[],
): Promise<{ answer: string; edits: RepairEdit[]; model: string }> {
  const res = await claude.json({
    role: "repair",
    system: "You are an editor who fixes unsupported sentences in a cited answer using only the given sources.",
    prompt: [
      `Sources:\n\n${formatSources(sources)}`,
      "===",
      `Answer:\n\n${answer}`,
      "===",
      `A fact-checker found these sentences unsupported by their cited sources:\n${unsupported.map((c) => `- ${c.text} (${c.note})`).join("\n")}`,
      "Rewrite only those sentences. For each one:",
      "- If a source supports a narrower, corrected or hedged version, rewrite the sentence to say only that, with the right citation (action \"softened\").",
      "- If only the citation was wrong and another source states it, fix the citation (action \"cited\").",
      "- Otherwise delete the sentence (action \"removed\").",
      "Leave every other sentence exactly as it is. Return the full revised answer and one edit per sentence: original is the sentence before, revised is the new sentence exactly as it appears in your revised answer (empty when removed).",
    ].join("\n\n"),
    schema: RepairSchema,
  });
  return { answer: res.data.answer.trim(), edits: res.data.edits, model: res.model };
}

/** Whitespace- and case-insensitive, but citation markers count: a re-cited sentence is a changed sentence. */
const sentenceKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Sentences of `after` that aren't in `before` (the ones the repair pass wrote, including citation-only fixes). */
export function changedSentences(before: string, after: string): string[] {
  const old = new Set(splitSentences(before).map((s) => sentenceKey(s.text)));
  return splitSentences(after)
    .map((s) => s.text)
    .filter((t) => !old.has(sentenceKey(t)) && squash(t).split(" ").length >= 3);
}

/** Re-verify only the given sentences in one call (cheap: no claim splitting, low effort). */
export async function reverifySentences(
  claude: LlmProvider,
  sentences: string[],
  sources: ReadSource[],
): Promise<{ claims: Claim[]; model: string }> {
  const res = await claude.json({ role: "verify", system: VERIFY_SYSTEM, prompt: reverifyPrompt(sentences, sources), schema: VerifySchema });
  const claims = normalizeClaims(res.data.claims, new Set(sources.map((s) => s.id)));
  // Trust our own sentence text over the model's copy, so spans always match the final answer.
  const aligned =
    claims.length === sentences.length
      ? claims.map((c, i) => ({ ...c, text: sentences[i]! }))
      : claims.map((c) => ({ ...c, text: sentences.find((s) => squash(s) === squash(c.text)) ?? c.text }));
  return { claims: aligned.map((c) => ({ ...c, repair: "rewritten" as const })), model: res.model };
}

/**
 * Rebuild the claim list for the repaired answer: keep checked claims whose text is still in the
 * final answer and doesn't overlap a rewritten sentence, add the re-verified rewritten sentences,
 * and move claims that disappeared to `removed`.
 */
export function rebuildClaims(finalAnswer: string, before: Claim[], rewritten: Claim[]): { claims: Claim[]; removed: Claim[] } {
  const located = locateClaims(finalAnswer, rewritten);
  const taken = located.map((c) => c.span).filter((s): s is NonNullable<typeof s> => s !== null);
  const overlaps = (s: { start: number; end: number }) => taken.some((t) => s.start < t.end && t.start < s.end);
  const kept: Claim[] = [];
  const removed: Claim[] = [];
  // An old claim that a rewritten sentence replaced (same words, maybe a new citation or a trimmed
  // phrase) isn't "removed"; it's superseded by the re-verified claim.
  const replacedBy = (c: Claim) => rewritten.some((r) => squash(r.text).includes(squash(c.text)) || squash(c.text).includes(squash(r.text)));
  for (const c of locateClaims(finalAnswer, before)) {
    if (c.span && !overlaps(c.span)) kept.push(c);
    else if (!c.span && replacedBy(c)) continue;
    // Only sentences the repair pass targeted can be deleted by it; any other unlocated claim stays (span null).
    else if (!c.span && c.verdict === "unsupported") removed.push({ ...c, repair: "removed" });
    else if (!c.span) kept.push(c);
  }
  const claims = [...kept, ...located].sort((a, b) => (a.span?.start ?? Infinity) - (b.span?.start ?? Infinity));
  return { claims, removed };
}
