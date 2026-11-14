import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckEvent } from "@studyhall/core";
import { describe, expect, it } from "vitest";
import { applyCheckEvent, correctedSegments, finishCheckRun, newCheckRun, type CheckRun } from "../lib/client/check";
import { findCheckRecording, findRecording, isCheckRecording, type DemoSet } from "../lib/client/demo";
import { CHECK_EXAMPLES } from "../components/CheckView";

const set = JSON.parse(readFileSync(join(import.meta.dirname, "..", "public", "demo", "recordings.json"), "utf8")) as DemoSet;
const rec = set.items.filter(isCheckRecording).find((r) => /£16 per person/.test(r.question))!;

describe("Check a claim demo recording", () => {
  it("exists, and the UK ETA example text matches it exactly (so the example replays in demo mode)", () => {
    expect(rec).toBeDefined();
    expect(findCheckRecording(set, CHECK_EXAMPLES[0]!.text)).toBe(rec);
    // The answer questions still resolve to their own recordings, not the check.
    expect(findRecording(set, "Which function replaces matlab.addons.install?")?.category).toBe("engineering");
    expect(findRecording(set, rec.question)).toBeUndefined();
  });

  it("replays through the reducer to a finished check with the £16 claim contradicted", () => {
    let run: CheckRun = newCheckRun(rec.question, "r1");
    const seen: string[] = [];
    for (const { ev } of rec.events) {
      run = applyCheckEvent(run, ev);
      seen.push(ev.type);
    }
    run = finishCheckRun(run, "ended");
    expect(seen.indexOf("claims")).toBeLessThan(seen.indexOf("claim_verdict"));
    expect(run.status).toBe("done");
    const eta = run.claims.find((c) => /£16 per person/.test(c.text))!;
    expect(eta.result?.verdict).toBe("contradicted");
    expect(eta.result?.sourcesSay).toMatch(/£20/);
    expect(run.claims.every((c) => c.result)).toBe(true);
    expect(run.statusText).toMatch(/supported · \d+ contradicted · \d+ unverifiable · [\d.]+s$/);
    expect(run.receipts!.corrected).toContain("£20");
  });
});

describe("check reducer", () => {
  const claims: CheckEvent = { type: "claims", claims: [{ id: 1, text: "A", quote: "A", span: null }, { id: 2, text: "B", quote: "B", span: null }], skipped: [] };

  it("streams verdicts one by one, counting progress", () => {
    let r = applyCheckEvent(newCheckRun("A. B.", "x"), claims);
    expect(r.statusText).toBe("Checking 2 claims against the live web…");
    r = applyCheckEvent(r, { type: "claim_progress", id: 2, phase: "searching", categoryId: "tech" });
    expect(r.claims[1]).toMatchObject({ phase: "searching", categoryId: "tech" });
    r = applyCheckEvent(r, {
      type: "claim_verdict",
      claim: { id: 2, text: "B", quote: "B", span: null, categoryId: "tech", queries: [], verdict: "supported", sourceIds: [1], evidence: "e", sourceQuote: "", note: "" },
    });
    expect(r.statusText).toBe("Checked 1 of 2 claims…");
    expect(r.claims[0]!.result).toBeUndefined();
  });

  it("an error before any claim shows the message; Stop keeps the finished verdicts", () => {
    expect(applyCheckEvent(newCheckRun("x", "e"), { type: "error", step: "search", message: "Live search is unavailable right now. Try the demo answers instead." }).error).toMatch(/unavailable/);
    const stopped = finishCheckRun(applyCheckEvent(newCheckRun("A. B.", "s"), claims), "stopped");
    expect(stopped).toMatchObject({ status: "stopped", statusText: "Stopped." });
    expect(stopped.claims).toHaveLength(2);
  });

  it("splits the corrected text into plain and corrected parts", () => {
    const text = "Fee is £16. Valid two years.";
    expect(correctedSegments({ text, edits: [{ start: 0, end: 11, original: "Fee is £16.", corrected: "Fee is £20." }] })).toEqual([
      { text: "Fee is £20.", original: "Fee is £16." },
      { text: " Valid two years." },
    ]);
  });
});
