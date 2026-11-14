import { AUTO_ID, categoryIds } from "@studyhall/core";
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
});

export type AnswerRequest = z.infer<typeof AnswerRequest>;

/** A 400 body that names each problem without echoing the input back. */
export function validationError(error: z.ZodError) {
  return {
    error: "invalid_request",
    issues: error.issues.map((i) => ({ path: i.path.join(".") || "(body)", message: i.message })),
  };
}
