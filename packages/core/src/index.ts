export { MODELS, ROLE_SETTINGS, FALLBACK_BETA, type ModelRole, type RoleSettings, type Effort } from "./config/models.js";
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
  type CallInput,
  type TextResult,
  type ClaudeClientOptions,
} from "./providers/claude.js";

export const VERSION = "0.1.0";
