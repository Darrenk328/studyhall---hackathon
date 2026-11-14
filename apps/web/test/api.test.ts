import type { PipelineEvent, PipelineOptions } from "@studyhall/core";
import { describe, expect, it, vi } from "vitest";
import { GET as getCategories } from "../app/api/categories/route";
import { answerStream } from "../lib/answer-stream";
import { capFromEnv, DailyCap } from "../lib/daily-cap";
import { publicCategories } from "../lib/categories";
import { clientIp, SlidingWindowLimiter } from "../lib/rate-limit";
import { AnswerRequest } from "../lib/schema";

// ---------------------------------------------------------------- validation

describe("AnswerRequest", () => {
  it("accepts a question with defaults for category and history", () => {
    expect(AnswerRequest.parse({ question: "  Who won the World Series?  " })).toEqual({
      question: "Who won the World Series?",
      category: "auto",
      history: [],
    });
  });

  it("normalizes the category and keeps valid history", () => {
    const r = AnswerRequest.parse({ question: "And kids?", category: "Health", history: [{ question: "Flu shot?", answer: "Yes [1]." }] });
    expect(r.category).toBe("health");
    expect(r.history).toHaveLength(1);
  });

  it("rejects empty or over-long questions, unknown categories and more than 6 history turns", () => {
    expect(AnswerRequest.safeParse({ question: "   " }).success).toBe(false);
    expect(AnswerRequest.safeParse({ question: "x".repeat(1001) }).success).toBe(false);
    expect(AnswerRequest.safeParse({ question: "x".repeat(1000) }).success).toBe(true);
    expect(AnswerRequest.safeParse({ question: "q", category: "astrology" }).success).toBe(false);
    const turn = { question: "q", answer: "a" };
    expect(AnswerRequest.safeParse({ question: "q", history: Array(6).fill(turn) }).success).toBe(true);
    expect(AnswerRequest.safeParse({ question: "q", history: Array(7).fill(turn) }).success).toBe(false);
  });

  it("accepts an app only when the category has it", () => {
    expect(AnswerRequest.parse({ question: "q", category: "engineering", app: "Fusion" }).app).toBe("fusion");
    expect(AnswerRequest.safeParse({ question: "q", category: "engineering", app: "blender" }).success).toBe(false);
    expect(AnswerRequest.safeParse({ question: "q", category: "health", app: "fusion" }).success).toBe(false);
    expect(AnswerRequest.parse({ question: "q", category: "engineering" }).app).toBeUndefined();
  });

  it("truncates long prior answers instead of rejecting them", () => {
    const r = AnswerRequest.parse({ question: "q", history: [{ question: "a", answer: "y".repeat(9000) }] });
    expect(r.history[0]!.answer).toHaveLength(4000);
  });
});

// ---------------------------------------------------------------- rate limit

describe("SlidingWindowLimiter", () => {
  it("allows 10 per minute per key, then reports when to retry", () => {
    let t = 0;
    const lim = new SlidingWindowLimiter(10, 60_000, () => t);
    for (let i = 0; i < 10; i++) expect(lim.check("a").ok).toBe(true);
    t = 15_000;
    expect(lim.check("a")).toEqual({ ok: false, retryAfterSec: 45 });
    expect(lim.check("b").ok).toBe(true);
    t = 60_001;
    expect(lim.check("a").ok).toBe(true);
  });

  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

// ---------------------------------------------------------------- daily cap

describe("DailyCap", () => {
  it("allows the cap per UTC day, then says when it resets", () => {
    let now = new Date("2026-11-13T23:00:00Z");
    const cap = new DailyCap(2, () => now);
    expect(cap.take()).toEqual({ ok: true, remaining: 1 });
    expect(cap.take()).toEqual({ ok: true, remaining: 0 });
    expect(cap.take()).toEqual({ ok: false, resetSec: 3600 });
    now = new Date("2026-11-14T00:00:01Z");
    expect(cap.take().ok).toBe(true);
  });

  it("reads DAILY_QUESTION_CAP, defaulting to 500 for missing or bad values", () => {
    expect(capFromEnv(undefined)).toBe(500);
    expect(capFromEnv("")).toBe(500);
    expect(capFromEnv("abc")).toBe(500);
    expect(capFromEnv("-3")).toBe(500);
    expect(capFromEnv("25")).toBe(25);
    expect(capFromEnv("0")).toBe(0);
  });
});

// ---------------------------------------------------------------- SSE stream

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

function parseSse(text: string): { event: string; data: { type: string } }[] {
  return text
    .split("\n\n")
    .filter((b) => b.startsWith("event:"))
    .map((b) => {
      const [e, d] = b.split("\n");
      return { event: e!.slice(7), data: JSON.parse(d!.slice(6)) };
    });
}

describe("answerStream", () => {
  it("streams each pipeline event as an SSE message and passes history and a signal", async () => {
    let seen: PipelineOptions | undefined;
    async function* run(_q: string, _c: string, opts: PipelineOptions): AsyncGenerator<PipelineEvent> {
      seen = opts;
      yield { type: "planning" };
      yield { type: "answer_delta", text: "Hi [1]." };
    }
    const history = [{ question: "a", answer: "b" }];
    const msgs = parseSse(await readAll(answerStream({ question: "q", category: "tech", history, run })));
    expect(msgs).toEqual([
      { event: "planning", data: { type: "planning" } },
      { event: "answer_delta", data: { type: "answer_delta", text: "Hi [1]." } },
    ]);
    expect(seen!.history).toEqual(history);
    expect(seen!.signal).toBeInstanceOf(AbortSignal);
  });

  it("turns an unexpected failure into a generic error event without leaking details", async () => {
    async function* run(): AsyncGenerator<PipelineEvent> {
      yield { type: "planning" };
      throw new Error("secret internal detail");
    }
    const text = await readAll(answerStream({ question: "q", category: "tech", history: [], run }));
    expect(text).not.toContain("secret internal detail");
    expect(parseSse(text).at(-1)).toMatchObject({ event: "error", data: { step: "server" } });
  });

  it("aborts the pipeline's signal and stops the generator when the client cancels", async () => {
    let signal: AbortSignal | undefined;
    const finished = vi.fn();
    async function* run(_q: string, _c: string, opts: PipelineOptions): AsyncGenerator<PipelineEvent> {
      signal = opts.signal;
      try {
        yield { type: "planning" };
        // Simulates a long upstream call that honors the signal.
        await new Promise((_, reject) => opts.signal!.addEventListener("abort", () => reject(opts.signal!.reason), { once: true }));
        yield { type: "verifying" };
      } finally {
        finished();
      }
    }
    const logs: string[] = [];
    const reader = answerStream({ question: "q", category: "tech", history: [], run, log: (m) => logs.push(m) }).getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: planning");
    await reader.cancel();
    await vi.waitFor(() => expect(finished).toHaveBeenCalled());
    expect(signal!.aborted).toBe(true);
    expect(logs.some((l) => l.includes("client disconnected (stream cancelled)"))).toBe(true);
    expect(logs.some((l) => l.includes("pipeline stopped after abort"))).toBe(true);
  });

  it("aborts when the request signal fires (client went away)", async () => {
    const req = new AbortController();
    let signal: AbortSignal | undefined;
    async function* run(_q: string, _c: string, opts: PipelineOptions): AsyncGenerator<PipelineEvent> {
      signal = opts.signal;
      yield { type: "planning" };
      await new Promise((_, reject) => opts.signal!.addEventListener("abort", () => reject(opts.signal!.reason), { once: true }));
    }
    const reader = answerStream({ question: "q", category: "tech", history: [], run, requestSignal: req.signal }).getReader();
    await reader.read();
    req.abort();
    await vi.waitFor(() => expect(signal!.aborted).toBe(true));
  });
});

// ---------------------------------------------------------------- categories

describe("GET /api/categories", () => {
  it("returns public fields only, auto first", async () => {
    const body = (await getCategories().json()) as { categories: Record<string, unknown>[] };
    expect(body.categories).toHaveLength(14);
    expect(body.categories[0]).toMatchObject({ id: "auto" });
    for (const c of body.categories) {
      const keys = Object.keys(c).sort();
      expect(keys).toEqual(c.id === "engineering" ? ["apps", "description", "icon", "id", "name", "starters"] : ["description", "icon", "id", "name", "starters"]);
    }
    const eng = body.categories.find((c) => c.id === "engineering") as { apps: { id: string; label: string; name: string }[] };
    expect(eng.apps.map((a) => a.label)).toEqual(["Fusion", "Inventor", "SolidWorks", "Onshape", "Creo", "FreeCAD", "MATLAB", "Simulink"]);
    expect(Object.keys(eng.apps[0]!).sort()).toEqual(["id", "label", "name"]);
    // No private values either: personas, domain lists and safety text stay server-side.
    const text = JSON.stringify(body);
    expect(text).not.toContain("You are a careful health educator");
    expect(text).not.toContain("mayoclinic.org");
    expect(text).not.toContain("no personal dosing");
    expect(publicCategories()[1]!.starters).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- POST /api/answer (no network paths)

describe("POST /api/answer", () => {
  const post = async (body: unknown, ip = "192.0.2.1") => {
    const { POST } = await import("../app/api/answer/route");
    return POST(
      new Request("http://localhost/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  };

  it("400s on bad JSON and on invalid fields, naming the problem", async () => {
    expect((await post("{nope", "192.0.2.10")).status).toBe(400);
    const res = await post({ question: "x".repeat(1001), category: "health" }, "192.0.2.11");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request", issues: [{ path: "question" }] });
  });

  it("429s the 11th request in a minute from one IP, with Retry-After", async () => {
    for (let i = 0; i < 10; i++) expect((await post({ question: "" }, "192.0.2.50")).status).toBe(400);
    const res = await post({ question: "" }, "192.0.2.50");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await post({ question: "" }, "192.0.2.51")).status).toBe(400);
  });
});

describe("POST /api/answer daily cap", () => {
  it("returns a friendly 503 once the day's budget is spent, without starting a pipeline", async () => {
    vi.resetModules();
    vi.stubEnv("DAILY_QUESTION_CAP", "0");
    const { POST } = await import("../app/api/answer/route");
    const res = await POST(
      new Request("http://localhost/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.77" },
        body: JSON.stringify({ question: "Who won the World Series?", category: "sports" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({ error: "daily_cap", message: expect.stringMatching(/come back/) });
    vi.unstubAllEnvs();
  });
});
