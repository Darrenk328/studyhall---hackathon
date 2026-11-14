/**
 * Single source of truth for models and per-step settings (PLAN.md §2).
 * Sonnet for answer + verify; Haiku for planning, classification and other cheap steps.
 */
export const MODELS = {
  answer: "claude-sonnet-5-5",
  verify: "claude-sonnet-5-5",
  plan: "claude-haiku-5-5",
  classify: "claude-haiku-5-5",
} as const;

export type ModelRole = keyof typeof MODELS;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface RoleSettings {
  model: string;
  effort: Effort;
  /**
   * "adaptive": thinking on (Sonnet 5.5 rejects "disabled").
   * "disabled": no thinking (allowed on Haiku 5.5 at effort high or below).
   */
  thinking: "adaptive" | "disabled";
  /** Server-side refusal fallback. Sonnet 5.5 supports `fallbacks: "default"`; Haiku 5.5 has none. */
  fallback: boolean;
  maxTokens: number;
}

export const ROLE_SETTINGS: Record<ModelRole, RoleSettings> = {
  answer: { model: MODELS.answer, effort: "medium", thinking: "adaptive", fallback: true, maxTokens: 16_000 },
  verify: { model: MODELS.verify, effort: "medium", thinking: "adaptive", fallback: true, maxTokens: 16_000 },
  plan: { model: MODELS.plan, effort: "low", thinking: "disabled", fallback: false, maxTokens: 2_000 },
  classify: { model: MODELS.classify, effort: "low", thinking: "disabled", fallback: false, maxTokens: 256 },
};

/** Beta header for `fallbacks: "default"`. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
