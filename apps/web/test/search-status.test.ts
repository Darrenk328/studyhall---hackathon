import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError, type SearchProvider } from "@studyhall/core";
import { describe, expect, it, vi } from "vitest";
import type { RedisRest } from "../lib/redis";
import { isOutOfCredit, memorySearchStatus, redisSearchStatus, trackSearch, type SearchStatusStore } from "../lib/search-status";

// The real 402 body You.com returned on 2026-11-13 while the credit was used up.
const fx = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "packages", "core", "test", "fixtures", "you-402.json"), "utf8")) as {
  status: number;
  url: string;
  body: string;
};
const http402 = () => new HttpError(fx.status, fx.url, fx.body);

function fakeRedis(): RedisRest & { kv: Map<string, string>; calls: (string | number)[][] } {
  const kv = new Map<string, string>();
  const calls: (string | number)[][] = [];
  return {
    kv,
    calls,
    async pipeline(cmds) {
      calls.push(...cmds);
      return cmds.map(([op, key, value]) => {
        if (op === "SET") {
          kv.set(String(key), String(value));
          return "OK";
        }
        if (op === "GET") return kv.get(String(key)) ?? null;
        return null;
      });
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const NOW = () => new Date("2026-11-14T02:00:00Z");

describe("search-credit status", () => {
  it("recognizes the recorded You.com 402 as out of credit, and nothing else", () => {
    expect(isOutOfCredit(http402())).toBe(true);
    expect(isOutOfCredit(new HttpError(500, fx.url, "x"))).toBe(false);
    expect(isOutOfCredit(new Error("HTTP 402"))).toBe(false);
  });

  it("marks out_of_credit on a 402 and clears it on the next success, with no extra API calls", async () => {
    const redis = fakeRedis();
    const store = redisSearchStatus(redis, () => {}, NOW);
    expect(await store.get()).toEqual({ status: "unknown" });

    let credit = false;
    const inner: SearchProvider = {
      search: vi.fn(async () => (credit ? [] : Promise.reject(http402()))),
      contents: vi.fn(async () => (credit ? [] : Promise.reject(http402()))),
    };
    const broke = trackSearch(inner, store);
    await expect(broke.search({ query: "a" })).rejects.toThrow(/402/);
    await expect(broke.contents(["https://x"])).rejects.toThrow(/402/);
    await flush();
    expect(await store.get()).toEqual({ status: "out_of_credit", at: "2026-11-14T02:00:00.000Z" });
    expect(redis.calls.filter((c) => c[0] === "SET")).toHaveLength(1); // only on change

    credit = true;
    const fixed = trackSearch(inner, store); // the next question
    await fixed.search({ query: "b" });
    await flush();
    expect((await store.get()).status).toBe("ok");
    expect(inner.search).toHaveBeenCalledTimes(2); // the wrapper never calls the API itself
  });

  it("other errors don't change the status; memory works without Redis", async () => {
    const store: SearchStatusStore = memorySearchStatus(NOW);
    await store.set("ok");
    const t = trackSearch({ search: async () => Promise.reject(new HttpError(500, fx.url, "x")), contents: async () => [] }, store);
    await expect(t.search({ query: "a" })).rejects.toThrow();
    await flush();
    expect((await store.get()).status).toBe("ok");
  });

  it("falls back to memory when Redis fails", async () => {
    const log = vi.fn();
    const store = redisSearchStatus({ pipeline: async () => Promise.reject(new Error("Upstash 500")) }, log, NOW);
    await store.set("out_of_credit");
    expect((await store.get()).status).toBe("out_of_credit");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Redis unavailable"));
  });
});
