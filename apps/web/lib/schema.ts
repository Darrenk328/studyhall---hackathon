import { AUTO_ID, categoryIds, getCategory, MAX_CHECK_CHARS, MAX_CODE_LINES } from "@studyhall/core";
import { z } from "zod";

export const MAX_QUESTION_CHARS = 1_000;
export const MAX_HISTORY_TURNS = 6;
/** Prior answers are context for follow-ups only; long ones are cut, not rejected. */
export const MAX_HISTORY_ANSWER_CHARS = 4_000;

const validCategory = (id: string) => id === AUTO_ID || categoryIds().includes(id);

export const HistoryTurn = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  answer: z.string().transform((s) => s.slice(0, MAX_HISTORY_ANSWER_CHARS)),
});

export const AnswerRequest = z.object({
  question: z
    .string({ error: "question is required" })
    .trim()
    .min(1, "Ask a question.")
    .max(MAX_QUESTION_CHARS, `Questions are limited to ${MAX_QUESTION_CHARS} characters.`),
  category: z
    .string()
    .trim()
    .toLowerCase()
    .default(AUTO_ID)
    .refine(validCategory, { message: `category must be one of: ${[AUTO_ID, ...categoryIds()].join(", ")}` }),
  history: z.array(HistoryTurn).max(MAX_HISTORY_TURNS, `History is limited to the last ${MAX_HISTORY_TURNS} turns.`).default([]),
  /** Optional app chip for categories that have apps (Engineering Software), e.g. "fusion". */
  app: z.string().trim().toLowerCase().min(1).max(40).optional(),
  /** Compare mode: also answer from memory, side by side. Counts as one question. */
  compare: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.app === undefined) return;
  const apps = getCategory(v.category)?.apps ?? [];
  if (!apps.some((a) => a.id === v.app)) {
    ctx.addIssue({
      code: "custom",
      path: ["app"],
      message: apps.length ? `app must be one of: ${apps.map((a) => a.id).join(", ")}` : `The ${v.category} category has no apps.`,
    });
  }
});

export type AnswerRequest = z.infer<typeof AnswerRequest>;

/** A 400 body that names each problem without echoing the input back. */
export function validationError(error: z.ZodError) {
  return {
    error: "invalid_request",
    issues: error.issues.map((i) => ({ path: i.path.join(".") || "(body)", message: i.message })),
  };
}

/** "Check a claim": a claim or pasted text (for example another AI's answer), up to MAX_CHECK_CHARS. */
export const CheckRequest = z.object({
  text: z
    .string({ error: "text is required" })
    .trim()
    .min(1, "Paste a claim or some text to check.")
    .max(MAX_CHECK_CHARS, `Text to check is limited to ${MAX_CHECK_CHARS.toLocaleString("en-US")} characters.`),
});
export type CheckRequest = z.infer<typeof CheckRequest>;

/** "Check my code": up to MAX_CODE_LINES lines of MATLAB, Fusion Python or iLogic, an optional language override and target release. */
export const MAX_CODE_CHARS = 8_000;
export const CodeRequest = z.object({
  code: z
    .string({ error: "code is required" })
    .min(1, "Paste some code to check.")
    .max(MAX_CODE_CHARS, `Code is limited to ${MAX_CODE_CHARS.toLocaleString("en-US")} characters.`)
    .refine((c) => c.trim().length > 0, "Paste some code to check.")
    .refine((c) => c.split("\n").length <= MAX_CODE_LINES, `Code is limited to ${MAX_CODE_LINES} lines.`),
  lang: z.enum(["matlab", "fusion", "ilogic"]).optional(),
  release: z.string().trim().max(40).optional(),
});
export type CodeRequest = z.infer<typeof CodeRequest>;
