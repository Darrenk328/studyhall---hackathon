import { describe, expect, it, vi } from "vitest";
import { redisDailyBudget, redisFromEnv, redisRateLimiter, type RedisRest } from "../lib/redis";

/** In-memory stand-in for the Upstash pipeline endpoint. */
function fakeRedis(): RedisRest & { store: Map<string, number> } {
  const store = new Map<string, number>();
  return {
    store,
    async pipeline(cmds) {
      return cmds.map(([op, key]) => {
        if (op === "INCR") {
          const v = (store.get(String(key)) ?? 0) + 1;
          store.set(String(key), v);
          return v;
        }
        return 1;
      });
    },
  };
}

describe("Upstash Redis limits", () => {
  it("reads either env naming and calls the pipeline endpoint with a bearer token", async () => {
    expect(redisFromEnv({})).toBeNull();
    const fetchFn = vi.fn(async () => new Response(JSON.stringify([{ result: 1 }, { result: 1 }])));
    const r = redisFromEnv({ KV_REST_API_URL: "https://x.upstash.io/", KV_REST_API_TOKEN: "t" }, fetchFn as unknown as typeof fetch)!;
    expect(await r.pipeline([["INCR", "k"]])).toEqual([1, 1]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.upstash.io/pipeline");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("limits per key per window", async () => {
    const lim = redisRateLimiter(fakeRedis(), 2, 60);
    expect((await lim.check("ip")).ok).toBe(true);
    expect(await lim.check("ip")).toEqual({ ok: true, remaining: 0 });
    expect((await lim.check("ip")).ok).toBe(false);
    expect((await lim.check("other")).ok).toBe(true);
  });

  it("caps the day globally and reports seconds to UTC midnight", async () => {
    const cap = redisDailyBudget(fakeRedis(), 1, () => {}, () => new Date("2026-11-13T23:00:00Z"));
    expect((await cap.take()).ok).toBe(true);
    expect(await cap.take()).toEqual({ ok: false, resetSec: 3600 });
  });

  it("falls back to memory when Redis fails, and says so", async () => {
    const log = vi.fn();
    const broken: RedisRest = { pipeline: async () => Promise.reject(new Error("Upstash 500")) };
    const lim = redisRateLimiter(broken, 1, 60, log);
    expect((await lim.check("ip")).ok).toBe(true);
    expect((await lim.check("ip")).ok).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Redis unavailable"));
  });
});
