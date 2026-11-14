import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../src/net/http.js";
import { SEARCH_UNAVAILABLE_MESSAGE } from "../src/pipeline/answer.js";
import { answerToReceipts } from "../src/pipeline/run.js";
import type { CallInput, TextResult } from "../src/providers/claude.js";
import type { LlmProvider, SearchProvider } from "../src/pipeline/types.js";

const fx = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "you-402.json"), "utf8")) as { status: number; url: string; body: string };
const http402 = () => new HttpError(fx.status, fx.url, fx.body);
const NOW = () => new Date("2026-11-14T12:00:00Z");

const claude = {
  json: vi.fn(async (i: CallInput) => {
    const meta = { model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
    if (i.role === "plan") return { data: { queries: ["q one", "q two"], software: null, version: null }, ...meta };
    if (i.role === "release") return { data: { release: null, resultIndex: null }, ...meta };
    return { data: {}, ...meta };
  }),
  async *stream(): AsyncGenerator<string, TextResult> {
    yield "";
    return { text: "", truncated: false, model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
  },
} as unknown as LlmProvider;

const failingYou = (err: () => Error): SearchProvider => ({ search: vi.fn(async () => Promise.reject(err())), contents: vi.fn(async () => []) });

describe("out of search credit (recorded You.com 402)", () => {
  it("says live search is unavailable instead of 'I couldn't verify this'", async () => {
    const r = await answerToReceipts("What is the 2027 401(k) limit?", "finance", { you: failingYou(http402), claude, now: NOW });
    expect(r.outcome).toBe("search_unavailable");
    expect(r.answer).toBe(SEARCH_UNAVAILABLE_MESSAGE);
    expect(r.answer).not.toMatch(/couldn't verify/);
    expect(r.confidence).toBe("low");
  });

  it("also works for version-aware categories, which run every query twice", async () => {
    const r = await answerToReceipts("Which function replaces matlab.addons.install?", "engineering", { you: failingYou(http402), claude, now: NOW });
    expect(r.outcome).toBe("search_unavailable");
    expect(r.answer).toBe(SEARCH_UNAVAILABLE_MESSAGE);
  });

  it("keeps the normal message when searches fail for other reasons", async () => {
    let n = 0;
    const mixed = failingYou(() => (n++ % 2 ? http402() : new HttpError(500, fx.url, "server error")));
    const r = await answerToReceipts("What is the 2027 401(k) limit?", "finance", { you: mixed, claude, now: NOW });
    expect(r.outcome).toBe("error");
    expect(r.answer).toMatch(/couldn't verify/);
  });
});
