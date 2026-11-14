import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyCodeEvent, CODE_EXAMPLES, finishCodeRun, newCodeRun, type CodeRun } from "../lib/client/code";
import { findCodeRecording, findRecording, isCodeRecording, type DemoSet } from "../lib/client/demo";
import { CodeRequest } from "../lib/schema";

const set = JSON.parse(readFileSync(join(import.meta.dirname, "..", "public", "demo", "recordings.json"), "utf8")) as DemoSet;
const rec = set.items.find(isCodeRecording)!;

describe("Check my code demo recording", () => {
  it("exists, matches the MATLAB example exactly, and isn't mistaken for an answer recording", () => {
    expect(rec).toBeDefined();
    expect(findCodeRecording(set, CODE_EXAMPLES[0]!.code)).toBe(rec);
    expect(findRecording(set, rec.question)).toBeUndefined();
  });

  it("replays through the reducer: matlab.addons.install deprecated, mpminstall, one corrected line", () => {
    let run: CodeRun = newCodeRun(rec.question, "c1");
    const types: string[] = [];
    for (const { ev } of rec.events) {
      run = applyCodeEvent(run, ev);
      types.push(ev.type);
    }
    run = finishCodeRun(run, "ended");
    expect(types[0]).toBe("code_parsed");
    expect(types.indexOf("release")).toBeLessThan(types.indexOf("call_verdict"));
    expect(run.status).toBe("done");
    const call = run.calls.find((c) => c.name === "matlab.addons.install")!;
    expect(call.result).toMatchObject({ status: "deprecated", replacement: "mpminstall" });
    expect(run.receipts!.edits).toHaveLength(1);
    expect(run.receipts!.corrected).toContain("mpminstall(");
    expect(run.receipts!.scope).toMatch(/doesn't run the code/);
  });
});

describe("CodeRequest", () => {
  it("accepts up to 150 lines with an optional language and release", () => {
    expect(CodeRequest.safeParse({ code: "x = 1;", lang: "matlab", release: "R2026b" }).success).toBe(true);
    expect(CodeRequest.safeParse({ code: Array(150).fill("x = 1;").join("\n") }).success).toBe(true);
  });
  it("rejects empty code, more than 150 lines, and unknown languages", () => {
    expect(CodeRequest.safeParse({ code: "   " }).success).toBe(false);
    expect(CodeRequest.safeParse({ code: Array(151).fill("x = 1;").join("\n") }).error!.issues[0]!.message).toMatch(/150 lines/);
    expect(CodeRequest.safeParse({ code: "x", lang: "python" }).success).toBe(false);
  });
});
