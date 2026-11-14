import type { Claim, Receipts } from "@studyhall/core";
import { describe, expect, it } from "vitest";
import { renderBlocks } from "../lib/client/render";
import { readSse } from "../lib/client/sse";
import { applyEvent, citationLabel, estimateClaims, finishTurn, historyFor, newTurn, sourceName, type Turn } from "../lib/client/turn";

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
    expect(t.statusText).toBe("Checking 2 claims…");
    expect(t.phase).toBe("verifying");
  });

  it("shows repair work after verdicts with unsupported claims", () => {
    const t = run({ type: "answer_delta", text: "x" }, { type: "verifying" }, { type: "verdicts", claims: [claim("x", 0, "unsupported")] });
    expect(t.statusText).toBe("Fixing 1 sentence…");
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

  it("estimates checkable sentences", () => {
    expect(estimateClaims("Yes. The CDC recommends it every season [1]. Adults over 65 get more [2].\n- A list item with words")).toBe(3);
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

describe("renderBlocks", () => {
  it("splits citations into chips and keeps claim membership", () => {
    const text = "First fact [1]. Second fact [2][3].";
    const [p] = renderBlocks(text, [claim("Second fact [2][3].", 16)]);
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
    const [p] = renderBlocks("Changed text [1].", [claim("Old text [1].", 0)]);
    expect(p!.items[0]!.every((a) => a.claim === -1)).toBe(true);
  });

  it("renders paragraphs and lists, and leaves an unfinished citation as text while streaming", () => {
    const blocks = renderBlocks("Intro [1].\n\n- one [2]\n- two\n\n1. first\n2. second [3", []);
    expect(blocks.map((b) => [b.kind, b.items.length])).toEqual([["p", 1], ["ul", 2], ["ol", 2]]);
    expect(blocks[2]!.items[1]).toEqual([{ kind: "text", text: "second [3", claim: -1 }]);
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
