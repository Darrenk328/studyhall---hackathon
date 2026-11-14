/**
 * Search-credit status for /api/health, learned from real questions only (no extra API calls).
 * A You.com search or contents call that returns HTTP 402 marks the status "out_of_credit"; the next
 * successful call marks it "ok". Stored in Upstash Redis when configured, so every serverless
 * instance (and /api/health) sees the same value; otherwise in process memory.
 */
import { HttpError, type SearchProvider } from "@studyhall/core";
import { redisFromEnv, type RedisRest } from "./redis";

export type SearchStatus = "ok" | "out_of_credit" | "unknown";
export interface SearchStatusValue {
  status: SearchStatus;
  /** ISO time the status was last written. */
  at?: string;
}

export interface SearchStatusStore {
  get(): Promise<SearchStatusValue>;
  set(status: Exclude<SearchStatus, "unknown">): Promise<void>;
}

const KEY = "studyhall:search:status";

/** One memory value per process, shared by every route bundle that imports this module. */
const memory = ((globalThis as { __studyhallSearchStatus?: { v: SearchStatusValue } }).__studyhallSearchStatus ??= { v: { status: "unknown" } });

export function memorySearchStatus(now: () => Date = () => new Date()): SearchStatusStore {
  return {
    get: async () => memory.v,
    set: async (status) => {
      memory.v = { status, at: now().toISOString() };
    },
  };
}

export function redisSearchStatus(redis: RedisRest, log: (m: string) => void = console.warn, now: () => Date = () => new Date()): SearchStatusStore {
  const fallback = memorySearchStatus(now);
  return {
    async get() {
      try {
        const [raw] = await redis.pipeline([["GET", KEY]]);
        if (typeof raw !== "string") return { status: "unknown" };
        const v = JSON.parse(raw) as SearchStatusValue;
        return v.status === "ok" || v.status === "out_of_credit" ? v : { status: "unknown" };
      } catch (err) {
        log(`search status: Redis unavailable, using memory (${err instanceof Error ? err.message : String(err)})`);
        return fallback.get();
      }
    },
    async set(status) {
      const value = JSON.stringify({ status, at: now().toISOString() });
      try {
        // Kept for a week; a deploy that sees no questions for that long reports "unknown".
        await redis.pipeline([["SET", KEY, value, "EX", 7 * 86400]]);
      } catch (err) {
        log(`search status: Redis unavailable, using memory (${err instanceof Error ? err.message : String(err)})`);
        await fallback.set(status);
      }
    },
  };
}

export function searchStatusFromEnv(log?: (m: string) => void): SearchStatusStore {
  const redis = redisFromEnv();
  return redis ? redisSearchStatus(redis, log) : memorySearchStatus();
}

export const isOutOfCredit = (err: unknown): boolean => err instanceof HttpError && err.status === 402;

/**
 * Wrap one request's search provider: report 402s as "out_of_credit" and successes as "ok". Writes
 * only when the value changes within this request, so a question costs at most a few Redis commands.
 * Status writes never block or fail the answer.
 */
export function trackSearch(inner: SearchProvider, store: SearchStatusStore): SearchProvider {
  let last: SearchStatus = "unknown";
  const report = (status: Exclude<SearchStatus, "unknown">) => {
    if (status === last) return;
    last = status;
    void store.set(status).catch(() => {});
  };
  const wrap =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        const out = await fn(...args);
        report("ok");
        return out;
      } catch (err) {
        if (isOutOfCredit(err)) report("out_of_credit");
        throw err;
      }
    };
  return { search: wrap(inner.search.bind(inner)), contents: wrap(inner.contents.bind(inner)) };
}
