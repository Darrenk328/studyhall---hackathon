import type { CheckEvent } from "@studyhall/core";
import { describe, expect, it, vi } from "vitest";
import { checkStream } from "../lib/check-stream";
import { CheckRequest } from "../lib/schema";

const parseSse = (text: string) =>
  text
    .split("\n\n")
    .filter((b) => b.startsWith("event:"))
    .map((b) => {
      const [e, d] = b.split("\n");
      return { event: e!.slice(7), data: JSON.parse(d!.slice(6)) as { type: string; [k: string]: unknown } };
    });

describe("CheckRequest", () => {
  it("accepts up to 2,000 characters of text and trims it", () => {
    expect(CheckRequest.parse({ text: "  The UK ETA costs £16.  " })).toEqual({ text: "The UK ETA costs £16." });
    expect(CheckRequest.safeParse({ text: "x".repeat(2000) }).success).toBe(true);
  });

  it("rejects empty or over-long text, naming the limit", () => {
    expect(CheckRequest.safeParse({ text: "   " }).success).toBe(false);
    const long = CheckRequest.safeParse({ text: "x".repeat(2001) });
    expect(long.success).toBe(false);
    expect(long.error!.issues[0]!.message).toMatch(/2,000 characters/);
  });
});

describe("checkStream", () => {
  it("streams each check event as an SSE message, in the answer stream's format", async () => {
    async function* run(): AsyncGenerator<CheckEvent> {
      yield { type: "extracting" };
      yield { type: "claims", claims: [{ id: 1, text: "c", quote: "c", span: null }], skipped: [] };
    }
    const msgs = parseSse(await new Response(checkStream({ run })).text());
    expect(msgs.map((m) => m.event)).toEqual(["extracting", "claims"]);
    expect(msgs[1]!.data).toMatchObject({ type: "claims", claims: [{ id: 1 }] });
  });

  it("turns an unexpected failure into a generic error without leaking details", async () => {
    async function* run(): AsyncGenerator<CheckEvent> {
      yield { type: "extracting" };
      throw new Error("secret internal detail");
    }
    const text = await new Response(checkStream({ run })).text();
    expect(text).not.toContain("secret internal detail");
    expect(parseSse(text).at(-1)).toMatchObject({ event: "error", data: { step: "server" } });
  });

  it("aborts the check's signal when the client cancels", async () => {
    let signal: AbortSignal | undefined;
    const finished = vi.fn();
    async function* run(s: AbortSignal): AsyncGenerator<CheckEvent> {
      signal = s;
      try {
        yield { type: "extracting" };
        await new Promise((_, reject) => s.addEventListener("abort", () => reject(s.reason), { once: true }));
      } finally {
        finished();
      }
    }
    const reader = checkStream({ run }).getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(finished).toHaveBeenCalled());
    expect(signal!.aborted).toBe(true);
  });
});

describe("POST /api/check", () => {
  const post = async (body: unknown, ip: string) => {
    const { POST } = await import("../app/api/check/route");
    return POST(
      new Request("http://localhost/api/check", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  };

  it("400s on bad JSON and over-long text", async () => {
    expect((await post("{nope", "198.51.100.1")).status).toBe(400);
    const res = await post({ text: "x".repeat(2001) }, "198.51.100.2");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request", issues: [{ path: "text" }] });
  });

  it("429s the 11th request in a minute from one IP", async () => {
    for (let i = 0; i < 10; i++) expect((await post({ text: "" }, "198.51.100.50")).status).toBe(400);
    expect((await post({ text: "" }, "198.51.100.50")).status).toBe(429);
  });

  it("a check costs 2 questions: with 1 left in the day's budget it's refused, without starting", async () => {
    vi.resetModules();
    vi.stubEnv("DAILY_QUESTION_CAP", "1");
    const res = await post({ text: "The UK ETA costs £16." }, "198.51.100.77");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "daily_cap" });
    vi.unstubAllEnvs();
  });
});
