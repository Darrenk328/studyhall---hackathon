import type { Claim, Receipts } from "@studyhall/core";
import { demoSpeed, findRecording, isDemoMode, replay, type DemoRecording, type DemoSet } from "../lib/client/demo";
import { describe, expect, it } from "vitest";
import { renderBlocks } from "../lib/client/render";
import { readSse } from "../lib/client/sse";
import { applyEvent, citationLabel, finishTurn, historyFor, newTurn, sourceName, type ClientEvent, type Turn } from "../lib/client/turn";

const claim = (text: string, start: number, verdict: Claim["verdict"] = "partial"): Claim => ({
  text,
  sourceIds: [1],
  verdict,
  note: "n",
  evidence: "",
  span: { start, end: start + text.length },
});

describe("turn reducer", () => {
  const run = (...evs: Parameters<typeof applyEvent>[1][]) => evs.reduce<Turn>((t, e) => applyEvent(t, e), newTurn("q", "health", "t1"));

  it("walks the status line through the pipeline", () => {
    expect(run({ type: "searching", count: 3 }).statusText).toBe("Searching 3 queries…");
    expect(run({ type: "reading", count: 5 }).statusText).toBe("Reading 5 sources…");
    const t = run({ type: "answer_delta", text: "The CDC recommends a flu shot for everyone [1]. " }, { type: "answer_delta", text: "Adults over 65 get a higher dose [2]." }, { type: "verifying" });
    expect(t.answer).toBe("The CDC recommends a flu shot for everyone [1]. Adults over 65 get a higher dose [2].");
    expect(t.statusText).toBe("Checking claims…");
    expect(t.phase).toBe("verifying");
    const checked = applyEvent(t, { type: "verdicts", claims: [claim("x", 0, "supported"), claim("y", 0, "partial"), claim("z", 0, "meta")] });
    expect(checked.statusText).toBe("Checked 2 claims");
  });

  it("shows repair work after verdicts with unsupported claims", () => {
    const t = run({ type: "answer_delta", text: "x" }, { type: "verifying" }, { type: "verdicts", claims: [claim("x", 0, "unsupported")] });
    expect(t.statusText).toBe("Checked 1 claim · fixing 1 sentence…");
  });

  it("keeps the answer and flags it unverified when the stream errors after answering", () => {
    const t = run({ type: "answer_delta", text: "An answer [1]." }, { type: "verifying" }, { type: "error", step: "server", message: "boom" });
    expect(t.answer).toBe("An answer [1].");
    expect(t.unverified).toMatch(/hasn't been checked/);
    expect(finishTurn(t, "ended")).toMatchObject({ status: "failed", answer: "An answer [1]." });
  });

  it("an error before any answer is an error, and a stop mid-answer is unverified", () => {
    expect(run({ type: "error", step: "search", message: "All searches failed" }).error).toBe("All searches failed");
    expect(finishTurn(run({ type: "answer_delta", text: "Partial" }), "stopped")).toMatchObject({ status: "stopped", unverified: expect.stringMatching(/Stopped/) });
  });

  it("done installs the final receipts", () => {
    const receipts = { answer: "Final [1].", claims: [], categoryId: "health", studyNotes: undefined, queries: ["a"], sources: [], timingsMs: { total: 12_400 } } as unknown as Receipts;
    const t = run({ type: "answer_delta", text: "Draft" }, { type: "done", receipts });
    expect(t).toMatchObject({ status: "done", answer: "Final [1].", statusText: "Searched 1 query · read 0 pages · 12.4s" });
  });

  it("history sends the last 6 finished, answered turns", () => {
    const done = (i: number): Turn => ({ ...newTurn(`q${i}`, "health", `t${i}`), status: "done", answer: `a${i}` });
    const turns = [...Array.from({ length: 8 }, (_, i) => done(i)), newTurn("running", "health", "r")];
    expect(historyFor(turns).map((h) => h.question)).toEqual(["q2", "q3", "q4", "q5", "q6", "q7"]);
  });

});

describe("citation labels", () => {
  it("names the publisher and month", () => {
    expect(citationLabel(3, { title: "Clinical Considerations | Influenza (Flu) ...", domain: "cdc.gov", published: "2026-09-23T00:00:00Z" })).toBe("Source 3: CDC, September 2026");
    expect(citationLabel(1, { title: "A very long page title with no separator at all", domain: "who.int" })).toBe("Source 1: WHO, undated");
    expect(sourceName({ title: "Releases · nodejs/node", domain: "github.com" })).toBe("github.com");
    expect(sourceName({ title: "Federal Funds Rate | Reuters", domain: "reuters.com" })).toBe("Reuters");
    expect(sourceName({ title: "Pricing | Influenza (Flu) ...", domain: "example.com" })).toBe("example.com");
    expect(sourceName({ title: "x", domain: "nhs.uk" })).toBe("NHS");
    expect(sourceName({ title: "x", domain: "fsis.usda.gov" })).toBe("USDA");
  });
});

describe("dates are shown as the source states them", () => {
  it("near midnight, a zone-less page date keeps its own day and month (no local-time shift)", async () => {
    const { monthYear } = await import("../lib/client/turn");
    // You.com page_age "2026-10-31T23:30:00" (no zone) is parsed as UTC by core and must still read October.
    expect(monthYear("2026-10-31T23:30:00.000Z")).toBe("October 2026");
    expect(monthYear("2026-11-01T00:10:00.000Z")).toBe("November 2026");
  });
});

describe("renderBlocks", () => {
  it("splits citations into chips and keeps claim membership", () => {
    const text = "First fact [1]. Second fact [2][3].";
    const [p] = renderBlocks(text, [claim("Second fact [2][3].", 16)]) as Extract<ReturnType<typeof renderBlocks>[number], { items: unknown }>[];
    expect(p!.kind).toBe("p");
    expect(p!.items[0]).toEqual([
      { kind: "text", text: "First fact ", claim: -1 },
      { kind: "cite", id: 1, claim: -1 },
      { kind: "text", text: ". ", claim: -1 },
      { kind: "text", text: "Second fact ", claim: 0 },
      { kind: "cite", id: 2, claim: 0 },
      { kind: "cite", id: 3, claim: 0 },
      { kind: "text", text: ".", claim: 0 },
    ]);
  });

  it("ignores claims whose span no longer matches the text", () => {
    const [p] = renderBlocks("Changed text [1].", [claim("Old text [1].", 0)]) as Extract<ReturnType<typeof renderBlocks>[number], { items: unknown }>[];
    expect(p!.items[0]!.every((a) => a.claim === -1)).toBe(true);
  });

  it("renders paragraphs and lists, and leaves an unfinished citation as text while streaming", () => {
    const blocks = renderBlocks("Intro [1].\n\n- one [2]\n- two\n\n1. first\n2. second [3", []) as Extract<ReturnType<typeof renderBlocks>[number], { items: unknown }>[];
    expect(blocks.map((b) => [b.kind, b.items.length])).toEqual([["p", 1], ["ul", 2], ["ol", 2]]);
    expect(blocks[2]!.items[1]).toEqual([{ kind: "text", text: "second [3", claim: -1 }]);
  });
});

describe("code blocks", () => {
  it("renders fenced code as a code block with offsets, without parsing citations inside it", () => {
    const text = "Use mpminstall [1].\n\n```matlab\nx = f([1]);\nmpminstall(\"p\")\n```\n\nDone [2].";
    const blocks = renderBlocks(text, []);
    expect(blocks.map((b) => b.kind)).toEqual(["p", "code", "p"]);
    const code = blocks[1] as Extract<(typeof blocks)[number], { kind: "code" }>;
    expect(code).toMatchObject({ lang: "matlab", code: 'x = f([1]);\nmpminstall("p")' });
    expect(text.slice(code.start, code.end)).toBe(code.code);
  });

  it("shows a block that is still streaming in as code", () => {
    const blocks = renderBlocks("Intro.\n\n```matlab\nmpminst", []);
    expect(blocks.at(-1)).toMatchObject({ kind: "code", code: "mpminst" });
  });
});

describe("readSse", () => {
  it("parses events split across chunks", async () => {
    const enc = new TextEncoder();
    const chunks = ['event: planning\ndata: {"type":"plan', 'ning"}\n\n: ping\n\nevent: answer_delta\ndata: {"type":"answer_delta","text":"Hi"}\n\n'];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch));
        c.close();
      },
    });
    const out = [];
    for await (const ev of readSse(body)) out.push(ev);
    expect(out).toEqual([{ type: "planning" }, { type: "answer_delta", text: "Hi" }]);
  });
});

describe("demo replay", () => {
  const rec: DemoRecording = {
    question: "What is the UK ETA fee?",
    category: "travel",
    recordedAt: "2026-11-13T20:00:00Z",
    events: [
      { t: 0, ev: { type: "status", text: "Planning" } as unknown as ClientEvent },
      { t: 400, ev: { type: "answer_delta", text: "£20" } as unknown as ClientEvent },
      { t: 1000, ev: { type: "answer_delta", text: "." } as unknown as ClientEvent },
    ],
  };
  it("turns on with ?demo=1, matches questions loosely, clamps speed", () => {
    expect(isDemoMode("?demo=1")).toBe(true);
    expect(isDemoMode("?demo=0")).toBe(false);
    expect(demoSpeed("?demo=1&speed=9")).toBe(4);
    expect(demoSpeed("?demo=1")).toBe(1);
    const set: DemoSet = { recordedAt: rec.recordedAt, items: [rec] };
    expect(findRecording(set, "  what is the uk eta   fee ")).toBe(rec);
    expect(findRecording(set, "Something else?")).toBeUndefined();
  });
  it("replays events in order at their recorded offsets, scaled by speed", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const out: ClientEvent[] = [];
    for await (const ev of replay(rec, new AbortController().signal, 2, sleep)) out.push(ev);
    expect(out).toHaveLength(3);
    expect(waits).toEqual([200, 300]);
  });
  it("stops when aborted", async () => {
    const c = new AbortController();
    const it = replay(rec, c.signal, 1, async () => c.abort());
    await it.next();
    await expect(it.next()).rejects.toThrow(/stopped/);
  });
});
