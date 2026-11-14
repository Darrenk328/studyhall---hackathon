/**
 * Single source of truth for model names (PLAN.md §2).
 * Sonnet for answer + verify; Haiku for planning, classification and other cheap steps.
 */
export const MODELS = {
  answer: "claude-sonnet-5-5",
  verify: "claude-sonnet-5-5",
  plan: "claude-haiku-5-5",
  classify: "claude-haiku-5-5",
} as const;

export type ModelRole = keyof typeof MODELS;
