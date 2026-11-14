import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import contentsFixture from "./fixtures/you-contents.json" with { type: "json" };
import searchFixture from "./fixtures/you-search.json" with { type: "json" };
import { DiskCache, noCache, stableStringify } from "../src/net/cache.js";
import { SchemaError } from "../src/net/http.js";
import { buildSearchBody, looseUrlKey, parsePageAge, YouClient } from "../src/providers/you.js";

function fetchReturning(...bodies: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify(bodies.shift()), { status: 200 })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>;
}

const client = (fetchImpl: typeof fetch, cache = noCache) => new YouClient({ apiKey: "test-key", cache, fetchImpl });

describe("YouClient.search (recorded fixture)", () => {
  it("parses and normalizes web results with ranks", async () => {
    const hits = await client(fetchReturning(searchFixture)).search({ query: "latest Node.js LTS release" });
    expect(hits.length).toBe(searchFixture.results.web.length);
    expect(hits[0]).toMatchObject({ rank: 0, kind: "web" });
    expect(hits[0]!.url).toMatch(/^https:\/\//);
    expect(hits.every((h) => h.title.length > 0)).toBe(true);
    expect(hits.map((h) => h.rank)).toEqual(hits.map((_, i) => i));
  });

  it("sends the API key and a JSON body", async () => {
    const f = fetchReturning(searchFixture);
    await client(f).search({ query: "q", freshness: "week", count: 3, boostDomains: ["nih.gov"] });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ydc-index.io/v1/search");
    expect(init.headers).toMatchObject({ "X-API-Key": "test-key" });
    expect(JSON.parse(init.body as string)).toEqual({ query: "q", count: 3, freshness: "week", boost_domains: ["nih.gov"] });
  });

  it("accepts a legacy news array", async () => {
    const legacy = { results: { web: [], news: [{ url: "https://n.test/a", title: "A" }] } };
    const hits = await client(fetchReturning(legacy)).search({ query: "q" });
    expect(hits).toEqual([expect.objectContaining({ url: "https://n.test/a", kind: "news", rank: 0 })]);
  });

  it("fails loudly on schema drift", async () => {
    await expect(client(fetchReturning({ hits: [] })).search({ query: "q" })).rejects.toBeInstanceOf(SchemaError);
  });
});

describe("YouClient.contents (recorded fixture)", () => {
  it("returns one entry per requested URL and marks missing ones", async () => {
    const urls = [contentsFixture[0]!.url, "https://example.invalid/studyhall-smoke-missing"];
    const pages = await client(fetchReturning(contentsFixture)).contents(urls);
    expect(pages.map((p) => p.status)).toEqual(["ok", "missing"]);
    expect(pages[0]!.markdown).toContain("Node.js");
  });

  it("marks null markdown as failed and matches URLs loosely", async () => {
    const body = [{ url: "https://www.site.test/page/", title: "T", markdown: null }];
    const [page] = await client(fetchReturning(body)).contents(["https://site.test/page"]);
    expect(page).toMatchObject({ status: "failed", markdown: null, title: "T" });
  });

  it("rejects more than 10 URLs", async () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://x.test/${i}`);
    await expect(client(fetchReturning([])).contents(urls)).rejects.toBeInstanceOf(RangeError);
  });
});

describe("buildSearchBody", () => {
  it("rejects include with exclude/boost (You.com returns 422)", () => {
    expect(() => buildSearchBody({ query: "q", includeDomains: ["a.com"], boostDomains: ["b.com"] })).toThrow(RangeError);
  });
  it("clamps count and validates freshness", () => {
    expect(buildSearchBody({ query: "q", count: 500 }).count).toBe(100);
    expect(buildSearchBody({ query: "q", freshness: "2026-01-01to2026-02-01" }).freshness).toBe("2026-01-01to2026-02-01");
    expect(() => buildSearchBody({ query: "q", freshness: "fortnight" })).toThrow();
  });
  it("rejects empty queries", () => {
    expect(() => buildSearchBody({ query: "  " })).toThrow(RangeError);
  });
});

describe("helpers", () => {
  it("parsePageAge treats zone-less timestamps as UTC", () => {
    expect(parsePageAge("2026-11-06T12:28:05")?.toISOString()).toBe("2026-11-06T12:28:05.000Z");
    expect(parsePageAge("2026-11-06T12:28:05+02:00")?.toISOString()).toBe("2026-11-06T10:28:05.000Z");
    expect(parsePageAge("not a date")).toBeUndefined();
    expect(parsePageAge(undefined)).toBeUndefined();
  });
  it("looseUrlKey ignores scheme, www, trailing slash and fragment", () => {
    expect(looseUrlKey("https://www.A.com/x/#top")).toBe(looseUrlKey("http://a.com/x"));
    expect(looseUrlKey("https://a.com/x?y=1")).not.toBe(looseUrlKey("https://a.com/x?y=2"));
  });
});

describe("dev disk cache", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("stableStringify ignores key order", () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }));
  });

  it("serves the second identical search from disk", async () => {
    dir = await mkdtemp(join(tmpdir(), "studyhall-cache-"));
    const f = fetchReturning(searchFixture, searchFixture);
    const you = client(f, new DiskCache(dir));
    const a = await you.search({ query: "same", count: 5 });
    const b = await you.search({ count: 5, query: "same" });
    expect(b).toEqual(a);
    expect(f).toHaveBeenCalledTimes(1);
    await you.search({ query: "different", count: 5 });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
