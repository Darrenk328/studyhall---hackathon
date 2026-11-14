import type { Category } from "../categories/types.js";
import { isoDate } from "./text.js";
import type { ReadSource } from "./types.js";

/** Numbered source block shared by the answer, verify and repair prompts. */
export function formatSources(sources: ReadSource[]): string {
  return sources
    .map((s) => {
      const date = s.published ? s.published.slice(0, 10) : "date unknown";
      const kind = s.readStatus === "full" ? "page excerpt" : "search snippets only, partial";
      return `[${s.id}] ${s.title}\nURL: ${s.url}\nDomain: ${s.domain} | Dated: ${date} | Text: ${kind}\n${s.text}`;
    })
    .join("\n\n---\n\n");
}

export function answerSystemPrompt(category: Category, now: Date): string {
  return [
    "You are Studyhall, a research assistant that answers only from the numbered sources it is given.",
    category.persona,
    `Today's date is ${isoDate(now)}.`,
    "",
    "Rules:",
    "1. Lead with the direct answer in the first sentence.",
    "2. Use only facts stated in the sources. Do not add facts from memory, even when you are confident. If the sources don't answer the question, say so plainly and say what is missing.",
    "3. Cite every factual sentence inline with the source numbers in square brackets at the end of the sentence, like [2] or [1][3]. Only use numbers from the source list.",
    "4. If sources disagree, say so: state what each side says and cite each. Don't silently pick one.",
    "5. Give dates for time-sensitive facts (for example \"as of October 2026\"). When sources differ only because one is newer, say which is newer and prefer it.",
    "6. Sources marked \"search snippets only\" are partial: don't over-read them. Don't talk about the sources' format or your process in the answer; the app shows the receipts.",
    "7. Keep it short: usually two to five sentences, or a short list when the question asks for several items. No headings. Don't add a sources list; the app shows sources separately.",
    ...(category.safety ? ["", `Safety: ${category.safety}`] : []),
  ].join("\n");
}

export function answerUserPrompt(question: string, sources: ReadSource[]): string {
  return `Sources:\n\n${formatSources(sources)}\n\n===\n\nQuestion: ${question}`;
}

/** Shown when Claude declines. Health, legal and finance point to a professional. */
export function refusalMessage(category: Category): string {
  const base = "I can't help with that question.";
  return category.professional ? `${base} For advice about your situation, please talk to ${category.professional}.` : base;
}

export function noResultsMessage(category: Category, queries: string[]): string {
  const where = category.preferredDomains.slice(0, 3).join(", ");
  return [
    "I couldn't verify this. My searches found no usable sources, so I won't guess.",
    "",
    `I searched for: ${queries.map((q) => `"${q}"`).join("; ")}.`,
    `You could check ${where} directly, or rephrase the question with more specific names or dates.`,
  ].join("\n");
}

export function insufficientMessage(category: Category, usable: ReadSource[]): string {
  const found = usable.length
    ? `I found ${usable.length} usable source${usable.length === 1 ? "" : "s"}: ${usable.map((s) => `${s.title} (${s.domain})`).join("; ")}.`
    : "I found no usable sources.";
  return [
    `I won't answer this ${category.name.toLowerCase()} question yet. ${found}`,
    `${category.name} answers need at least ${category.minSources} usable sources, so ${category.minSources - usable.length} more confirming source${category.minSources - usable.length === 1 ? " is" : "s are"} missing.`,
    ...(category.professional ? [`For a decision about your own situation, talk to ${category.professional}.`] : []),
  ].join(" ");
}
