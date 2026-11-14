import { describe, expect, it, vi } from "vitest";
import { getCategory } from "../src/categories/registry.js";
import { ClaudeRefusalError, type CallInput, type JsonResult, type TextResult } from "../src/providers/claude.js";
import type { PageContent, SearchHit, SearchParams } from "../src/providers/you.js";
import { finalizeQueries } from "../src/pipeline/plan.js";
import { computeConfidence } from "../src/pipeline/receipts.js";
import { answer, answerToReceipts } from "../src/pipeline/run.js";
import { mergeAndRank, recencyBoost, scoreCandidate, searchAll } from "../src/pipeline/search.js";
import type { Claim, LlmProvider, PipelineEvent, SearchProvider, Source } from "../src/pipeline/types.js";
import { applyRepairs, normalizeClaims } from "../src/pipeline/verify.js";

const NOW = new Date("2026-11-11T12:00:00Z");
const health = getCategory("health")!;
const tech = getCategory("tech")!;

const hit = (url: string, rank: number, pageAge?: string, title = url): SearchHit => ({
  url,
  title,
  description: `Description of ${url} with enough words to be a usable snippet for the answer step.`,
  snippets: [`Snippet text from ${url} about flu vaccines for adults and older people this season.`],
  ...(pageAge ? { pageAge } : {}),
  rank,
  kind: "web",
});

// ---------------------------------------------------------------- fakes

function fakeYou(byQuery: Record<string, SearchHit[]>, pages: Record<string, string | null> = {}) {
  const search = vi.fn(async (p: SearchParams) => byQuery[p.query] ?? byQuery["*"] ?? []);
  const contents = vi.fn(
    async (urls: string[]): Promise<PageContent[]> =>
      urls.map((url) =>
        url in pages
          ? { url, markdown: pages[url] ?? null, status: pages[url] ? "ok" : "failed" }
          : { url, markdown: null, status: "missing" },
      ),
  );
  return { you: { search, contents } satisfies SearchProvider, search, contents };
}

interface FakeClaudeScript {
  queries?: string[];
  category?: string;
  answer?: string | Error;
  claims?: Omit<Claim, "repair">[];
  repair?: { answer: string; edits: { claim: string; action: "softened" | "cited" | "removed" }[] };
}

function fakeClaude(script: FakeClaudeScript) {
  const calls: string[] = [];
  const meta = (model: string) => ({ model, usage: { inputTokens: 1, outputTokens: 1 }, failedOver: false });
  const json = vi.fn(async (input: CallInput): Promise<JsonResult<unknown>> => {
    calls.push(input.role);
    switch (input.role) {
      case "classify":
        return { data: { category: script.category ?? "tech" }, ...meta("claude-haiku-5-5") };
      case "plan":
        return { data: { queries: script.queries ?? ["q1", "q2"] }, ...meta("claude-haiku-5-5") };
      case "verify":
        return { data: { claims: script.claims ?? [] }, ...meta("claude-sonnet-5-5") };
      case "repair":
        return { data: script.repair ?? { answer: "", edits: [] }, ...meta("claude-sonnet-5-5") };
      default:
        throw new Error(`unexpected json role ${input.role}`);
    }
  });
  async function* stream(input: CallInput): AsyncGenerator<string, TextResult> {
    calls.push(input.role);
    if (script.answer instanceof Error) throw script.answer;
    const text = script.answer ?? "Answer [1].";
    for (const part of text.match(/.{1,12}/gs) ?? []) yield part;
    return { text, truncated: false, ...meta("claude-sonnet-5-5") };
  }
  return { claude: { json, stream } as unknown as LlmProvider, calls };
}

async function collect(gen: AsyncGenerator<PipelineEvent>) {
  const events: PipelineEvent[] = [];
  for await (const e of gen) events.push(e);
  const done = events.at(-1);
  if (done?.type !== "done") throw new Error("last event must be done");
  return { events, receipts: done.receipts, types: events.map((e) => e.type) };
}

const PAGE = (topic: string) => `# ${topic}\n\nAdults 65 and older should get a higher-dose flu vaccine this season. ${"Filler. ".repeat(10)}`;

// ---------------------------------------------------------------- ranking

describe("ranking", () => {
  it("applies the plan's formula: rank + 2*preferred + 1*multi-query + recency - 99*blocked", () => {
    const base = { key: "k", url: "u", title: "t", domain: "x.com", description: "", snippets: [], foundBy: ["a"], bestRank: 0, preferred: false, blocked: false };
    expect(scoreCandidate(base, 10, "week", NOW)).toBe(1);
    expect(scoreCandidate({ ...base, bestRank: 5 }, 10, "week", NOW)).toBe(0.5);
    expect(scoreCandidate({ ...base, preferred: true }, 10, "week", NOW)).toBe(3);
    expect(scoreCandidate({ ...base, foundBy: ["a", "b"] }, 10, "week", NOW)).toBe(2);
    expect(scoreCandidate({ ...base, published: new Date("2026-11-10T00:00:00Z") }, 10, "week", NOW)).toBe(2);
    expect(scoreCandidate({ ...base, blocked: true }, 10, "week", NOW)).toBe(-98);
  });

  it("recency boost is full inside the window, half up to 2x, zero after or when undated", () => {
    expect(recencyBoost(new Date("2026-11-05T00:00:00Z"), "week", NOW)).toBe(1);
    expect(recencyBoost(new Date("2026-10-31T00:00:00Z"), "week", NOW)).toBe(0.5);
    expect(recencyBoost(new Date("2026-01-01T00:00:00Z"), "week", NOW)).toBe(0);
    expect(recencyBoost(undefined, "week", NOW)).toBe(0);
    expect(recencyBoost(new Date("2026-11-10T00:00:00Z"), "any", NOW)).toBe(0);
  });

  it("dedupes across queries by normalized URL and rewards preferred and multi-query hits", () => {
    const ranked = mergeAndRank(
      [
        { query: "a", hits: [hit("https://blog.example/x", 0), hit("https://www.cdc.gov/flu/", 3)] },
        { query: "b", hits: [hit("https://cdc.gov/flu?utm_source=feed", 1), hit("https://pinterest.com/pin/1", 0)] },
      ],
      health,
      10,
      NOW,
    );
    expect(ranked.map((c) => c.domain)).toEqual(["cdc.gov", "blog.example", "pinterest.com"]);
    expect(ranked[0]).toMatchObject({ bestRank: 1, foundBy: ["a", "b"], preferred: true });
    expect(ranked.at(-1)!.blocked).toBe(true);
    expect(ranked[0]!.snippets.length).toBe(2);
  });

  it("sends preferred/blocked domains to You.com, drops blocked results, keeps top N", async () => {
    const hits = Array.from({ length: 12 }, (_, i) => hit(`https://site${i}.example/p`, i));
    const { you, search } = fakeYou({ "*": [...hits, hit("https://quora.com/q", 0)] });
    const out = await searchAll(you, ["q1", "q2"], health, NOW, { perQuery: 10, topN: 8 });
    expect(out.candidates).toHaveLength(8);
    expect(out.candidates.some((c) => c.domain === "quora.com")).toBe(false);
    expect(search.mock.calls[0]![0]).toMatchObject({
      freshness: "year",
      boostDomains: health.preferredDomains,
      excludeDomains: health.blockedDomains,
    });
  });

  it("searches again without the date filter when too few results come back", async () => {
    const search = vi.fn(async (p: SearchParams) => (p.freshness ? [hit("https://a.example/1", 0)] : [hit("https://b.example/2", 0), hit("https://c.example/3", 1)]));
    const out = await searchAll({ search, contents: vi.fn() }, ["q"], tech, NOW, { perQuery: 10, topN: 8 });
    expect(out.freshnessRelaxed).toBe(true);
    expect(out.candidates).toHaveLength(3);
  });

  it("throws only when every query fails", async () => {
    let n = 0;
    const search = vi.fn(async () => {
      if (n++ === 0) throw new Error("boom");
      return [hit("https://a.example/1", 0), hit("https://b.example/1", 1), hit("https://c.example/1", 2)];
    });
    const out = await searchAll({ search, contents: vi.fn() }, ["q1", "q2"], tech, NOW, { perQuery: 10, topN: 8 });
    expect(out.failedQueries).toHaveLength(1);
    const allFail = vi.fn(async () => Promise.reject(new Error("down")));
    await expect(searchAll({ search: allFail, contents: vi.fn() }, ["q1"], tech, NOW, { perQuery: 10, topN: 8 })).rejects.toThrow(/All 1 searches failed/);
  });
});

// ---------------------------------------------------------------- planning

describe("finalizeQueries", () => {
  it("dedupes, caps at 4 and guarantees a query with the current year", () => {
    const q = finalizeQueries(["flu shot", "Flu shot", "a", "b", "c", "d"], "Who needs a flu shot?", NOW);
    expect(q).toHaveLength(4);
    expect(q.some((x) => x.includes("2026"))).toBe(true);
    expect(new Set(q.map((x) => x.toLowerCase())).size).toBe(q.length);
  });
  it("falls back to the question itself", () => {
    expect(finalizeQueries([], "Who needs a flu shot?", NOW)).toEqual(["Who needs a flu shot", "Who needs a flu shot 2026"]);
  });
});

// ---------------------------------------------------------------- verify helpers

describe("claim normalization", () => {
  it("drops unknown source ids and marks uncited claims unsupported", () => {
    const claims = normalizeClaims(
      [
        { text: "A [1].", sourceIds: [1, 9], contradicted: false, verdict: "supported", note: "ok", evidence: "q" },
        { text: "B [9].", sourceIds: [9], contradicted: false, verdict: "supported", note: "ok", evidence: "" },
      ],
      new Set([1, 2]),
    );
    expect(claims[0]).toMatchObject({ sourceIds: [1], verdict: "supported" });
    expect(claims[1]).toMatchObject({ sourceIds: [], verdict: "unsupported", note: "No valid citation." });
  });

  it("forces unsupported when the checker reports a contradiction but grades it partial", () => {
    const [c] = normalizeClaims(
      [{ text: "Met on October 21 [1].", sourceIds: [1], contradicted: true, verdict: "partial", note: "Source says October 28.", evidence: "" }],
      new Set([1]),
    );
    expect(c).toMatchObject({ verdict: "unsupported", note: "Contradicted by the cited source. Source says October 28." });
  });

  it("applies repair edits without re-verifying", () => {
    const claims: Claim[] = [
      { text: "Kept [1].", sourceIds: [1], verdict: "supported", note: "", evidence: "" },
      { text: "Wrong number [2].", sourceIds: [2], verdict: "unsupported", note: "Source says 5", evidence: "" },
      { text: "Made up [1].", sourceIds: [1], verdict: "unsupported", note: "Not in source", evidence: "" },
    ];
    const out = applyRepairs(claims, [
      { claim: "Wrong number [2]", action: "softened" },
      { claim: "made up [1].", action: "removed" },
    ]);
    expect(out.map((c) => [c.verdict, c.repair])).toEqual([
      ["supported", undefined],
      ["partial", "softened"],
      ["unsupported", "removed"],
    ]);
  });
});

// ---------------------------------------------------------------- confidence

describe("computeConfidence", () => {
  const src = (id: number, domain: string, published?: string): Source => ({
    id, url: `https://${domain}/${id}`, title: "t", domain, score: 1, foundBy: [], preferred: false, readStatus: "full", cited: true,
    ...(published ? { published } : {}),
  });
  const claim = (verdict: Claim["verdict"], repair?: Claim["repair"]): Claim => ({ text: "x", sourceIds: [1], verdict, note: "", evidence: "", ...(repair ? { repair } : {}) });
  const fresh = "2026-11-01T00:00:00.000Z";

  it("high: all supported, 2+ domains, fresh", () => {
    expect(computeConfidence([claim("supported")], [src(1, "cdc.gov", fresh), src(2, "who.int")], health, NOW).confidence).toBe("high");
  });
  it("medium: partial claims, a single domain, or stale sources", () => {
    expect(computeConfidence([claim("partial")], [src(1, "cdc.gov", fresh), src(2, "who.int")], health, NOW).confidence).toBe("medium");
    expect(computeConfidence([claim("supported")], [src(1, "cdc.gov", fresh)], health, NOW).confidence).toBe("medium");
    expect(computeConfidence([claim("supported")], [src(1, "cdc.gov", "2024-01-01T00:00:00Z"), src(2, "who.int")], health, NOW).confidence).toBe("medium");
  });
  it("low: any unsupported claim left, nothing checked or nothing cited", () => {
    expect(computeConfidence([claim("supported"), claim("unsupported")], [src(1, "cdc.gov", fresh), src(2, "who.int")], health, NOW).confidence).toBe("low");
    expect(computeConfidence([], [src(1, "cdc.gov", fresh)], health, NOW).confidence).toBe("low");
    expect(computeConfidence([claim("supported")], [], health, NOW).confidence).toBe("low");
  });
  it("claims removed by repair don't count", () => {
    expect(computeConfidence([claim("supported"), claim("unsupported", "removed")], [src(1, "cdc.gov", fresh), src(2, "who.int")], health, NOW).confidence).toBe("high");
  });
});

// ---------------------------------------------------------------- end to end

describe("answer() pipeline", () => {
  const urls = ["https://www.cdc.gov/flu/vaccines", "https://www.who.int/flu", "https://blog.example/flu"];
  const hits = [hit(urls[0]!, 0, "2026-10-01T00:00:00"), hit(urls[1]!, 1, "2026-09-15T00:00:00"), hit(urls[2]!, 2)];
  const pages = { [urls[0]!]: PAGE("CDC flu"), [urls[1]!]: PAGE("WHO flu"), [urls[2]!]: null };

  it("streams events in order and returns full receipts with timings and models", async () => {
    const { you } = fakeYou({ "*": hits }, pages);
    const { claude, calls } = fakeClaude({
      answer: "Adults 65+ should get a higher-dose flu vaccine [1][2]. Bogus cite [7].",
      claims: [
        { text: "Adults 65+ should get a higher-dose flu vaccine [1][2].", sourceIds: [1, 2], verdict: "supported", note: "Stated.", evidence: "Adults 65 and older" },
      ],
    });
    const { types, receipts, events } = await collect(answer("Who should get a higher-dose flu shot?", "health", { you, claude, now: () => NOW }));

    expect(types).toEqual([
      "category", "planning", "queries", "searching", "sources", "reading",
      ...Array(types.filter((t) => t === "answer_delta").length).fill("answer_delta"),
      "answer_replaced", "verifying", "verdicts", "done",
    ]);
    expect(events.find((e) => e.type === "answer_replaced")).toMatchObject({ reason: "sanitized" });
    expect(calls).toEqual(["plan", "answer", "verify"]);
    expect(receipts).toMatchObject({
      outcome: "answered",
      categoryId: "health",
      categoryAuto: false,
      answer: "Adults 65+ should get a higher-dose flu vaccine [1][2]. Bogus cite.",
      removedCitations: [7],
      confidence: "high",
      citedDomains: ["cdc.gov", "who.int"],
      models: { plan: "claude-haiku-5-5", answer: "claude-sonnet-5-5", verify: "claude-sonnet-5-5" },
      asOf: NOW.toISOString(),
    });
    expect(receipts.sources.map((s) => [s.id, s.readStatus, s.cited])).toEqual([
      [1, "full", true],
      [2, "full", true],
      [3, "snippets", false],
    ]);
    expect(receipts.sources[2]!.readNote).toMatch(/could not be crawled/);
    expect(receipts.newestSourceAge).toBe("1 month old");
    for (const step of ["plan", "search", "read", "answer", "verify", "total"] as const) {
      expect(typeof receipts.timingsMs[step]).toBe("number");
    }
    expect(receipts.sources[0]).not.toHaveProperty("text");
  });

  it("runs the repair pass exactly once when claims are unsupported", async () => {
    const { you } = fakeYou({ "*": hits }, pages);
    const { claude, calls } = fakeClaude({
      answer: "Good [1]. Invented statistic [2].",
      claims: [
        { text: "Good [1].", sourceIds: [1], verdict: "supported", note: "", evidence: "" },
        { text: "Invented statistic [2].", sourceIds: [2], verdict: "unsupported", note: "Not in source.", evidence: "" },
      ],
      repair: { answer: "Good [1].", edits: [{ claim: "Invented statistic [2].", action: "removed" }] },
    });
    const { receipts, events } = await collect(answer("q", "health", { you, claude, now: () => NOW }));
    expect(calls.filter((c) => c === "repair")).toHaveLength(1);
    expect(calls.filter((c) => c === "verify")).toHaveLength(1);
    expect(events.filter((e) => e.type === "answer_replaced").map((e) => (e as { reason: string }).reason)).toEqual(["repaired"]);
    expect(receipts.answer).toBe("Good [1].");
    expect(receipts.claims[1]).toMatchObject({ repair: "removed" });
  });

  it("refusal: returns a refused outcome and points health questions to a clinician, without retrying", async () => {
    const { you } = fakeYou({ "*": hits }, pages);
    const { claude, calls } = fakeClaude({ answer: new ClaudeRefusalError("answer", "bio", "claude-sonnet-5-5") });
    const { receipts, events } = await collect(answer("q", "health", { you, claude, now: () => NOW }));
    expect(receipts.outcome).toBe("refused");
    expect(receipts.answer).toMatch(/can't help/);
    expect(receipts.answer).toMatch(/clinician/);
    expect(receipts.refusal).toEqual({ step: "answer", category: "bio" });
    expect(receipts.models.answer).toBe("claude-sonnet-5-5");
    expect(receipts.confidence).toBe("low");
    expect(calls.filter((c) => c === "answer")).toHaveLength(1);
    expect(events.find((e) => e.type === "answer_replaced")).toMatchObject({ reason: "refused" });
  });

  it("refusal in a category without a professional gives a plain message", async () => {
    const { you } = fakeYou({ "*": hits }, pages);
    const { claude } = fakeClaude({ answer: new ClaudeRefusalError("answer", null, "claude-sonnet-5-5") });
    const receipts = await answerToReceipts("q", "tech", { you, claude, now: () => NOW });
    expect(receipts.answer).toBe("I can't help with that question.");
  });

  it("insufficient sources: declines below minSources without calling the answer model", async () => {
    const thin = { ...hit(urls[0]!, 0), description: "", snippets: [] };
    const { you } = fakeYou({ "*": [thin] }, { [urls[0]!]: PAGE("CDC flu") });
    const { claude, calls } = fakeClaude({});
    const receipts = await answerToReceipts("q", "health", { you, claude, now: () => NOW });
    expect(receipts.outcome).toBe("insufficient_sources");
    expect(receipts.answer).toMatch(/at least 2 usable sources/);
    expect(receipts.answer).toMatch(/1 more confirming source is missing/);
    expect(calls).not.toContain("answer");
  });

  it("no results: says it couldn't verify and suggests where to check", async () => {
    const { you } = fakeYou({});
    const { claude, calls } = fakeClaude({});
    const receipts = await answerToReceipts("q", "health", { you, claude, now: () => NOW });
    expect(receipts.outcome).toBe("no_results");
    expect(receipts.answer).toMatch(/couldn't verify/);
    expect(receipts.answer).toMatch(/who\.int/);
    expect(calls).not.toContain("answer");
  });

  it("auto: classifies first and records the classifier model", async () => {
    const { you } = fakeYou({ "*": hits }, pages);
    const { claude, calls } = fakeClaude({ category: "health", claims: [] });
    const receipts = await answerToReceipts("q", "auto", { you, claude, now: () => NOW });
    expect(calls[0]).toBe("classify");
    expect(receipts).toMatchObject({ categoryId: "health", categoryAuto: true, models: { classify: "claude-haiku-5-5" } });
    expect(typeof receipts.timingsMs.classify).toBe("number");
  });

  it("rejects unknown categories", async () => {
    const { you } = fakeYou({});
    const { claude } = fakeClaude({});
    await expect(answerToReceipts("q", "astrology", { you, claude })).rejects.toThrow(/Unknown category/);
  });
});
