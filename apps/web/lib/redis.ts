/**
 * Upstash Redis over its REST API (plain fetch, no SDK), for the per-IP rate limit and the global
 * daily cap. Shared across serverless instances, unlike the in-memory versions. If Redis can't be
 * reached, each check falls back to the in-memory limiter so the app keeps working (and logs it).
 */
import { DailyCapResult, DailyBudget, memoryDailyBudget } from "./daily-cap";
import { memoryRateLimiter, RateLimiter } from "./rate-limit";

export interface RedisRest {
  /** Run commands in one round trip; returns each command's result. */
  pipeline(commands: (string | number)[][]): Promise<unknown[]>;
}

/** Reads UPSTASH_REDIS_REST_URL/TOKEN, or KV_REST_API_URL/TOKEN as set by Vercel's Upstash integration. */
export function redisFromEnv(env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): RedisRest | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return {
    async pipeline(commands) {
      const res = await fetchFn(`${url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) throw new Error(`Upstash ${res.status}`);
      const out = (await res.json()) as { result?: unknown; error?: string }[];
      const err = out.find((r) => r.error);
      if (err) throw new Error(`Upstash: ${err.error}`);
      return out.map((r) => r.result);
    },
  };
}

const PREFIX = "studyhall";

/** Fixed-window per-key limit: INCR a key that expires with the window. */
export function redisRateLimiter(redis: RedisRest, limit: number, windowSec: number, log: (m: string) => void = console.warn): RateLimiter {
  const fallback = memoryRateLimiter(limit, windowSec * 1000);
  return {
    async check(key) {
      const window = Math.floor(Date.now() / 1000 / windowSec);
      const k = `${PREFIX}:rl:${key}:${window}`;
      try {
        const [count] = (await redis.pipeline([
          ["INCR", k],
          ["EXPIRE", k, windowSec + 5],
        ])) as [number, number];
        if (count > limit) return { ok: false, retryAfterSec: Math.max(1, (window + 1) * windowSec - Math.floor(Date.now() / 1000)) };
        return { ok: true, remaining: limit - count };
      } catch (err) {
        log(`rate limit: Redis unavailable, using memory (${err instanceof Error ? err.message : String(err)})`);
        return fallback.check(key);
      }
    },
  };
}

/** Global daily budget: one counter per UTC day. */
export function redisDailyBudget(redis: RedisRest, limit: number, log: (m: string) => void = console.warn, now: () => Date = () => new Date()): DailyBudget {
  const fallback = memoryDailyBudget(limit);
  return {
    limit,
    async take(): Promise<DailyCapResult> {
      const t = now();
      const k = `${PREFIX}:cap:${t.toISOString().slice(0, 10)}`;
      try {
        const [used] = (await redis.pipeline([
          ["INCR", k],
          ["EXPIRE", k, 2 * 86400],
        ])) as [number, number];
        if (used > limit) {
          const midnight = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
          return { ok: false, resetSec: Math.max(1, Math.ceil((midnight - t.getTime()) / 1000)) };
        }
        return { ok: true, remaining: limit - used };
      } catch (err) {
        log(`daily cap: Redis unavailable, using memory (${err instanceof Error ? err.message : String(err)})`);
        return fallback.take();
      }
    },
  };
}
