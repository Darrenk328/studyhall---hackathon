import { z } from "zod";
import { formatSources } from "./answer.js";
import type { Claim, LlmProvider, ReadSource } from "./types.js";

export const VerifySchema = z.object({
  claims: z.array(
    z.object({
      text: z.string(),
      sourceIds: z.array(z.number()),
      /** True when any detail in the sentence conflicts with the cited sources. Forces "unsupported". */
      contradicted: z.boolean(),
      verdict: z.enum(["supported", "partial", "unsupported"]),
      note: z.string(),
      evidence: z.string(),
    }),
  ),
});

const RepairSchema = z.object({
  answer: z.string(),
  edits: z.array(z.object({ claim: z.string(), action: z.enum(["softened", "cited", "removed"]) })),
});

export const VERIFY_SYSTEM = [
  "You are a strict fact-checker. You check an answer against the numbered sources it cites.",
  "Judge only against the source text provided, never against your own knowledge.",
].join(" ");

export function verifyPrompt(answer: string, sources: ReadSource[]): string {
  return [
    `Sources:\n\n${formatSources(sources)}`,
    "===",
    `Answer to check:\n\n${answer}`,
    "===",
    "Split the answer into its factual claims, usually one per sentence. Skip sentences with no factual content, and skip statements that the sources don't cover the question.",
    "For each claim return:",
    "- text: the sentence copied exactly from the answer, including its citation markers.",
    "- sourceIds: the citation numbers attached to that sentence (empty if none).",
    "- contradicted: true if any detail in the sentence (a number, date, name, version, place or direction of change) conflicts with what the cited sources say. Check every number and date individually.",
    "- verdict:",
    "  - \"supported\": every fact in the sentence is stated in the cited sources.",
    "  - \"partial\": nothing in the sentence conflicts with the sources, but some detail isn't covered by them, or the wording is broader or less precise than the source.",
    "  - \"unsupported\": any detail is contradicted by the cited sources, the main point isn't in the cited sources, or the sentence has no citation. One wrong number, date or name makes the whole sentence unsupported, even if the rest is right.",
    "- evidence: a short quote (25 words or fewer) from a cited source that supports the claim, or an empty string.",
    "- note: one short sentence explaining the verdict.",
  ].join("\n\n");
}

/** Deterministic checks on the model's verdicts: unknown ids are dropped; no valid citation means unsupported. */
export function normalizeClaims(raw: z.infer<typeof VerifySchema>["claims"], validIds: ReadonlySet<number>): Claim[] {
  return raw.map((c) => {
    const sourceIds = [...new Set(c.sourceIds.filter((n) => validIds.has(n)))].sort((a, b) => a - b);
    const noCitation = sourceIds.length === 0;
    const forced = noCitation || c.contradicted;
    const note =
      noCitation && c.verdict !== "unsupported"
        ? "No valid citation."
        : c.contradicted && c.verdict !== "unsupported"
          ? `Contradicted by the cited source. ${c.note.trim()}`
          : c.note.trim();
    return {
      text: c.text.trim(),
      sourceIds,
      verdict: forced ? "unsupported" : c.verdict,
      note,
      evidence: c.evidence.trim().slice(0, 300),
    };
  });
}

export async function verifyAnswer(
  claude: LlmProvider,
  answer: string,
  sources: ReadSource[],
): Promise<{ claims: Claim[]; model: string }> {
  const res = await claude.json({ role: "verify", system: VERIFY_SYSTEM, prompt: verifyPrompt(answer, sources), schema: VerifySchema });
  return { claims: normalizeClaims(res.data.claims, new Set(sources.map((s) => s.id))), model: res.model };
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
): Promise<{ answer: string; edits: z.infer<typeof RepairSchema>["edits"]; model: string }> {
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
      "- If a source supports a narrower or hedged version, rewrite the sentence to say only that, with the right citation (action \"softened\").",
      "- If only the citation was wrong and another source states it, fix the citation (action \"cited\").",
      "- Otherwise delete the sentence (action \"removed\").",
      "Leave every other sentence exactly as it is. Return the full revised answer and one edit per sentence, with claim set to the original sentence.",
    ].join("\n\n"),
    schema: RepairSchema,
  });
  return { answer: res.data.answer.trim(), edits: res.data.edits, model: res.model };
}

/**
 * Plant a factual error for testing verify: change the first number in `sentence`, keeping its
 * citation markers. Years move back two; days of the month move back a week; other numbers change
 * enough to be clearly wrong but still plausible.
 */
export function plantNumberError(sentence: string): string | undefined {
  const body = sentence.replace(/\[\d+]/g, (m) => `\uE000${m.slice(1, -1)}\uE001`);
  const m = body.match(/(?<![\d\uE000])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\d\uE001])/);
  if (!m || m.index === undefined) return undefined;
  const raw = m[1]!;
  const n = Number(raw.replace(/,/g, ""));
  let next: string;
  if (/^(19|20)\d{2}$/.test(raw)) next = String(n - 2);
  else if (raw.includes(".")) next = (n + 1.5).toFixed(raw.split(".")[1]!.length);
  else if (raw.includes(",")) next = Math.round(n * 1.4).toLocaleString("en-US");
  // Keep errors plausible: small numbers and day-of-month values stay in range.
  else next = String(n < 10 ? n + 3 : n <= 31 ? n - 7 : Math.round(n * 1.4));
  const planted = body.slice(0, m.index) + next + body.slice(m.index + raw.length);
  return planted.replace(/\uE000(\d+)\uE001/g, "[$1]");
}

export const squash = (s: string) => s.toLowerCase().replace(/\[\d+]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Apply repair edits to the claim list without re-verifying (no second loop): softened or re-cited
 * claims become "partial"; removed claims stay in the receipts, marked removed.
 */
export function applyRepairs(claims: Claim[], edits: { claim: string; action: Claim["repair"] & string }[]): Claim[] {
  const byText = new Map(edits.map((e) => [squash(e.claim), e.action]));
  return claims.map((c) => {
    if (c.verdict !== "unsupported") return c;
    const action = byText.get(squash(c.text));
    if (!action) return c;
    return action === "removed"
      ? { ...c, repair: "removed" }
      : { ...c, repair: action, verdict: "partial", note: `${c.note} Rewritten by the repair pass (${action}).` };
  });
}
