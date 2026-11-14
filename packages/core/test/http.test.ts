import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { backoffDelay, fetchJson, HttpError, isRetryableStatus, parseWith, SchemaError, TimeoutError } from "../src/net/http.js";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

function fakeFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  return fn as unknown as typeof fetch & typeof fn;
}

const noSleep = vi.fn(async () => {});
const retry = { retries: 2, baseDelayMs: 1, maxDelayMs: 5 };

describe("isRetryableStatus", () => {
  it("retries only 429 and 5xx", () => {
    expect([429, 500, 502, 503, 599].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 402, 403, 404, 408, 409, 422].some(isRetryableStatus)).toBe(false);
  });
});

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    const f = fakeFetch(json(200, { a: 1 }));
    await expect(fetchJson({ url: "https://x.test", fetchImpl: f, sleep: noSleep })).resolves.toEqual({ a: 1 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and 503, then succeeds", async () => {
    const f = fakeFetch(json(429, "slow down"), json(503, "busy"), json(200, { ok: true }));
    await expect(fetchJson({ url: "https://x.test", fetchImpl: f, retry, sleep: noSleep })).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("does not retry 4xx other than 429", async () => {
    const f = fakeFetch(json(422, { error: "bad combo" }), json(200, {}));
    await expect(fetchJson({ url: "https://x.test", fetchImpl: f, retry, sleep: noSleep })).rejects.toMatchObject({
      name: "HttpError",
      status: 422,
    });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget", async () => {
    const f = fakeFetch(json(500, "a"), json(500, "b"), json(500, "c"), json(200, {}));
    await expect(fetchJson({ url: "https://x.test", fetchImpl: f, retry, sleep: noSleep })).rejects.toBeInstanceOf(HttpError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("maps aborts to TimeoutError", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const f = fakeFetch(abort);
    await expect(fetchJson({ url: "https://x.test", fetchImpl: f, timeoutMs: 5, sleep: noSleep })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("raises SchemaError for a non-JSON body", async () => {
    const f = fakeFetch(json(200, "<html>oops</html>"));
    await expect(fetchJson({ url: "https://x.test", fetchImpl: f, sleep: noSleep })).rejects.toBeInstanceOf(SchemaError);
  });

  it("sends JSON body, method and headers", async () => {
    const f = fakeFetch(json(200, {}));
    await fetchJson({ url: "https://x.test", headers: { "X-API-Key": "k" }, body: { q: 1 }, fetchImpl: f, sleep: noSleep });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"q":1}');
    expect(init.headers).toMatchObject({ "X-API-Key": "k", "Content-Type": "application/json" });
  });
});

describe("backoffDelay", () => {
  const policy = { retries: 3, baseDelayMs: 100, maxDelayMs: 1_000 };
  it("honors Retry-After seconds, capped", () => {
    expect(backoffDelay(0, policy, "0.5")).toBe(500);
    expect(backoffDelay(0, policy, "60")).toBe(1_000);
  });
  it("grows exponentially without a header", () => {
    expect(backoffDelay(0, policy)).toBeGreaterThanOrEqual(100);
    expect(backoffDelay(2, policy)).toBeGreaterThanOrEqual(400);
  });
});

describe("parseWith", () => {
  it("names failing paths", () => {
    expect(() => parseWith(z.object({ a: z.object({ b: z.string() }) }), { a: { b: 3 } }, "test")).toThrow(/a\.b/);
  });
});
