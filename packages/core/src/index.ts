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

export type { Category, FreshnessWindow, AppConfig } from "./categories/types.js";
export {
  CATEGORIES,
  AUTO_ID,
  AUTO_CATEGORY,
  getCategory,
  categoryIds,
  UnknownCategoryError,
} from "./categories/registry.js";
export { answer, answerToReceipts } from "./pipeline/run.js";
export { SEARCH_UNAVAILABLE_MESSAGE } from "./pipeline/answer.js";
export { SearchUnavailableError } from "./pipeline/search.js";
export {
  checkClaims,
  checkToReceipts,
  correctText,
  correctionEdits,
  countVerdicts,
  summaryLine,
  MAX_CHECK_CHARS,
  MAX_CHECK_CLAIMS,
  CHECK_COST_IN_QUESTIONS,
  CLAIM_VERDICTS,
  type CheckEvent,
  type CheckOptions,
  type CheckReceipts,
  type CheckedClaim,
  type ClaimVerdict,
  type CheckOutcome,
  type CheckPhase,
  type CorrectionEdit,
  type ExtractedClaim,
  type SkippedSentence,
} from "./pipeline/check.js";
export {
  checkCode,
  checkCodeToReceipts,
  detectLanguage,
  parseApiCalls,
  CODE_APPS,
  CODE_CHECK_SCOPE,
  MAX_CODE_LINES,
  MAX_CODE_CALLS,
  type ApiCall,
  type CallStatus,
  type CheckedCall,
  type CodeApp,
  type CodeCheckEvent,
  type CodeCheckOptions,
  type CodeCheckReceipts,
  type CodeEdit,
  type CodeLang,
} from "./pipeline/code-check.js";
export { memoryAnswer, memorySystemPrompt, whereTheyDiffer, verifiedClaims, type Difference, type WhereTheyDiffer } from "./pipeline/compare.js";
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
  HistoryTurn,
  SoftwareContext,
  Usage,
  Verdict,
  Confidence,
  Outcome,
  ReadStatus,
  Step,
  SearchProvider,
  LlmProvider,
} from "./pipeline/types.js";

export { CLAUDE_PRICE_PER_MTOK, YOU_PRICE, claudeCost, youCost } from "./config/pricing.js";
export const VERSION = "0.5.1";
