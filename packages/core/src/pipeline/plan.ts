import { z } from "zod";
import type { Category } from "../categories/types.js";
import { isoDate } from "./text.js";
import { formatHistory } from "./answer.js";
import { disambiguateQueries, softwareLine, type ResolvedApps } from "./apps.js";
import type { HistoryTurn, LlmProvider } from "./types.js";

const PlanSchema = z.object({ queries: z.array(z.string()) });
/** Version-aware categories also extract the software and any version the user mentioned. */
const VersionPlanSchema = z.object({
  queries: z.array(z.string()),
  software: z.string().nullable(),
  version: z.string().nullable(),
});

export interface PlanResult {
  queries: string[];
  model?: string;
  fallback: boolean;
  /** Version-aware only: the software and version the planner found in the question. */
  software?: string | null;
  version?: string | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Deterministic clean-up of planned queries: trim, dedupe, cap at 4, ensure at least 2 and at least
 * one that names the current year (PLAN.md §4 step 1).
 */
export function finalizeQueries(raw: string[], question: string, now: Date): string[] {
  const year = String(now.getUTCFullYear());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of raw) {
    const t = q.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
    const key = t.toLowerCase();
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  const base = question.replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "");
  if (out.length === 0) out.push(base);
  const queries = out.slice(0, 4);
  if (!queries.some((q) => q.includes(year))) {
    const anchored = `${base} ${year}`;
    if (queries.length >= 4) queries[3] = anchored;
    else queries.push(anchored);
  }
  if (queries.length < 2) queries.push(base);
  return [...new Set(queries)];
}

export async function planQueries(
  claude: LlmProvider,
  question: string,
  category: Category,
  now: Date,
  history: HistoryTurn[] = [],
  resolved?: ResolvedApps,
): Promise<PlanResult> {
  const today = `${isoDate(now)} (${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()})`;
  const versionAware = Boolean(category.versionAware);
  const finish = (raw: string[]) => {
    const q = finalizeQueries(raw, question, now);
    return versionAware && resolved ? disambiguateQueries(q, question, resolved, now) : q;
  };
  try {
    const res = await claude.json({
      role: "plan",
      system:
        "You write web search queries for a research assistant that must find current, authoritative sources. " +
        "You never answer the question yourself.",
      prompt: [
        `Today is ${today}.`,
        `Category: ${category.name}. ${category.description}`,
        `Hints:\n${category.queryHints.map((h) => `- ${h}`).join("\n")}`,
        ...(history.length ? [`Earlier in this conversation:\n${formatHistory(history, 300)}`] : []),
        `Question: ${question}`,
        "",
        "Write 2 to 4 different search queries that together find the best current sources for this question.",
        ...(history.length ? ["Make every query standalone: resolve references like \"it\" or \"what about kids\" using the conversation."] : []),
        ...(versionAware && resolved ? [`Software: ${softwareLine(resolved, null)}`] : []),
        `At least one query must include the current year (${now.getUTCFullYear()}). Keep each query under 12 words.`,
        ...(versionAware
          ? [
              "Also return software: the product the question is about if the question or the selection names one (use its full name, for example \"Autodesk Fusion\" or \"MATLAB\"), else null;",
              "and version: a release, version, build or year of the software the user mentioned (for example \"R2025a\" or \"2026\"), else null. Don't guess a version the user didn't mention.",
            ]
          : []),
      ].join("\n"),
      schema: versionAware ? VersionPlanSchema : PlanSchema,
    });
    const data = res.data as { queries: string[]; software?: string | null; version?: string | null };
    return {
      queries: finish(data.queries),
      model: res.model,
      fallback: false,
      ...(versionAware ? { software: data.software ?? null, version: data.version ?? null } : {}),
    };
  } catch {
    return { queries: finish([]), fallback: true };
  }
}
