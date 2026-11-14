/**
 * Single source of truth for models and per-step settings (PLAN.md §2).
 * Sonnet for answer + verify; Haiku for planning, classification and other cheap steps.
 */
export const MODELS = {
  answer: "claude-sonnet-5-5",
  verify: "claude-sonnet-5-5",
  repair: "claude-sonnet-5-5",
  plan: "claude-haiku-5-5",
  classify: "claude-haiku-5-5",
  notes: "claude-haiku-5-5",
  compare: "claude-haiku-5-5",
  release: "claude-haiku-5-5",
} as const;

export type ModelRole = keyof typeof MODELS;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Model tried once when the primary is still overloaded (529) or returning 5xx after the SDK's
 * own retries. Never used for refusals. Sonnet 5 has its own rate-limit pool and accepts every
 * setting below (including thinking "disabled"). Set to undefined to turn failover off.
 */
export const OVERLOAD_FAILOVER_MODEL: string | undefined = "claude-sonnet-5";

export interface RoleSettings {
  model: string;
  effort: Effort;
  /**
   * "adaptive": thinking on.
   * "disabled": no thinking (Haiku 5.5 at effort high or below; Sonnet 5.5 rejects it).
   * "off": no thinking on any model. Sent as `between_tools` to Sonnet 5.5 (its only thinking-off
   * mode, effort high or below) and as `disabled` to other models, e.g. the overload failover.
   */
  thinking: "adaptive" | "disabled" | "off";
  maxTokens: number;
  failoverModel?: string | undefined;
}

export const ROLE_SETTINGS: Record<ModelRole, RoleSettings> = {
  answer: { model: MODELS.answer, effort: "medium", thinking: "adaptive", maxTokens: 16_000, failoverModel: OVERLOAD_FAILOVER_MODEL },
  // Low effort is kept only while the planted-error test catches every plant live (see DECISIONS.md).
  verify: { model: MODELS.verify, effort: "low", thinking: "adaptive", maxTokens: 16_000, failoverModel: OVERLOAD_FAILOVER_MODEL },
  repair: { model: MODELS.repair, effort: "medium", thinking: "adaptive", maxTokens: 16_000, failoverModel: OVERLOAD_FAILOVER_MODEL },
  plan: { model: MODELS.plan, effort: "low", thinking: "disabled", maxTokens: 2_000, failoverModel: OVERLOAD_FAILOVER_MODEL },
  classify: { model: MODELS.classify, effort: "low", thinking: "disabled", maxTokens: 256, failoverModel: OVERLOAD_FAILOVER_MODEL },
  notes: { model: MODELS.notes, effort: "low", thinking: "disabled", maxTokens: 4_000, failoverModel: OVERLOAD_FAILOVER_MODEL },
  release: { model: MODELS.release, effort: "low", thinking: "disabled", maxTokens: 300, failoverModel: OVERLOAD_FAILOVER_MODEL },
  compare: { model: MODELS.compare, effort: "low", thinking: "disabled", maxTokens: 2_000, failoverModel: OVERLOAD_FAILOVER_MODEL },
};
