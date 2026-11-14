export { MODELS, ROLE_SETTINGS, OVERLOAD_FAILOVER_MODEL, type ModelRole, type RoleSettings, type Effort } from "./config/models.js";
export { loadEnv, requireEnv, envFlag, projectRoot, MissingEnvError } from "./env.js";
export { fetchJson, parseWith, HttpError, TimeoutError, SchemaError, isRetryableStatus, DEFAULT_RETRY, type RetryPolicy } from "./net/http.js";
export { DiskCache, noCache, cacheFromEnv, cacheKey, stableStringify, type ResponseCache } from "./net/cache.js";
export {
  YouClient,
  SEARCH_URL,
  CONTENTS_URL,
  Freshness,
  looseUrlKey,
  parsePageAge,
  type SearchHit,
  type SearchParams,
  type PageContent,
  type YouClientOptions,
} from "./providers/you.js";
export {
  ClaudeClient,
  ClaudeRefusalError,
  ClaudeTruncatedError,
  ClaudeAuthError,
  isOverloadError,
  type CallMeta,
  type JsonResult,
  type CallInput,
  type TextResult,
  type ClaudeClientOptions,
} from "./providers/claude.js";

export type { Category, FreshnessWindow } from "./categories/types.js";
export {
  CATEGORIES,
  AUTO_ID,
  AUTO_CATEGORY,
  getCategory,
  categoryIds,
  UnknownCategoryError,
} from "./categories/registry.js";
export { answer, answerToReceipts } from "./pipeline/run.js";
export type {
  PipelineEvent,
  PipelineOptions,
  Receipts,
  Source,
  SourceSummary,
  Claim,
  StudyNotes,
  NoteItem,
  RepairEdit,
  Verdict,
  Confidence,
  Outcome,
  ReadStatus,
  Step,
  SearchProvider,
  LlmProvider,
} from "./pipeline/types.js";

export const VERSION = "0.2.0";
