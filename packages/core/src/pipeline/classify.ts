import { z } from "zod";
import { CATEGORIES, FALLBACK_CATEGORY_ID } from "../categories/registry.js";
import type { HistoryTurn, LlmProvider } from "./types.js";

/** The `auto` category: a cheap Haiku call picks a real category id. */
export async function classifyCategory(
  claude: LlmProvider,
  question: string,
  history: HistoryTurn[] = [],
): Promise<{ categoryId: string; model?: string; fallback: boolean }> {
  const ids = CATEGORIES.map((c) => c.id) as [string, ...string[]];
  const schema = z.object({ category: z.enum(ids) });
  const list = CATEGORIES.map((c) => `- ${c.id}: ${c.description}`).join("\n");
  try {
    const res = await claude.json({
      role: "classify",
      system: "You route questions to the single best category. Reply with the category id only.",
      prompt: `Categories:\n${list}\n\n${history.length ? `Previous question: ${history.at(-1)!.question}\n` : ""}Question: ${question}`,
      schema,
    });
    return { categoryId: res.data.category, model: res.model, fallback: false };
  } catch {
    return { categoryId: FALLBACK_CATEGORY_ID, fallback: true };
  }
}
