export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number };

/** What the route needs from a rate limiter. The in-memory one below; Upstash Redis at deploy (DECISIONS.md). */
export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

/** Adapts the synchronous in-memory limiter to the async interface. */
export function memoryRateLimiter(limit: number, windowMs: number): RateLimiter {
  const l = new SlidingWindowLimiter(limit, windowMs);
  return { check: async (key) => l.check(key) };
}

/**
 * Sliding-window rate limiter, in memory. Each server instance keeps its own window, so on a
 * multi-instance deploy the effective limit is per instance (see DECISIONS.md).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((h) => t - h < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + this.windowMs - t) / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(t);
    return { ok: true, remaining: this.limit - recent.length };
  }

  private prune(t: number) {
    for (const [k, v] of this.hits) if (v.every((h) => t - h >= this.windowMs)) this.hits.delete(k);
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
