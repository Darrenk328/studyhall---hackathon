import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../src/net/http.js";
import { SEARCH_UNAVAILABLE_MESSAGE } from "../src/pipeline/answer.js";
import {
  acceptEdits,
  applyEdits,
  checkCode,
  checkCodeToReceipts,
  CODE_CHECK_SCOPE,
  CODE_APPS,
  CODE_JUDGE_SYSTEM,
  codeQuery,
  detectLanguage,
  fallbackCodeQuery,
  mentionsCall,
  mapCallVerdict,
  parseApiCalls,
  type CodeCheckEvent,
} from "../src/pipeline/code-check.js";
import type { CallInput } from "../src/providers/claude.js";
import type { SearchHit, SearchParams } from "../src/providers/you.js";
import type { LlmProvider, SearchProvider } from "../src/pipeline/types.js";

const NOW = new Date("2026-11-14T12:00:00Z");
const fx402 = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "you-402.json"), "utf8")) as { status: number; url: string; body: string };

const MATLAB = `% Install the toolbox, then plot the data
matlab.addons.install("MyToolbox.mltbx");
T = readtable("data.csv");   % not a call: "plot(" in a comment
plot(T.x, T.y);
function out = helper(x)
  out = x * 2;
end`;

const FUSION = `import adsk.core, adsk.fusion, traceback

def run(context):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    rootComp = design.rootComponent
    sketch = rootComp.sketches.add(rootComp.xYConstructionPlane)
    sketch.sketchCurves.sketchLines.addTwoPointRectangle(adsk.core.Point3D.create(0, 0, 0), adsk.core.Point3D.create(5, 5, 0))
    extrudes = rootComp.features.extrudeFeatures
    distance = adsk.core.ValueInput.createByReal(5)
    extrudes.addSimple(sketch.profiles.item(0), distance, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)`;

const ILOGIC = `' Copy the part number into a custom property
Dim pn As String = iProperties.ValueInDoc(ThisDoc.Document, "Project", "Part Number")
Parameter("d0") = 50
iLogicVb.UpdateWhenDone = True`;

describe("language detection and local parsing (no model)", () => {
  it("detects MATLAB, Fusion Python and iLogic", () => {
    expect(detectLanguage(MATLAB)).toBe("matlab");
    expect(detectLanguage(FUSION)).toBe("fusion");
    expect(detectLanguage(ILOGIC)).toBe("ilogic");
  });

  it("MATLAB: lists calls, skips comments, strings, keywords and the code's own functions and variables", () => {
    const names = parseApiCalls(MATLAB, "matlab").map((c) => c.name);
    expect(names).toEqual(["matlab.addons.install", "readtable", "plot"]);
    expect(parseApiCalls(MATLAB, "matlab").find((c) => c.name === "plot")!.lines).toEqual([4]);
  });

  it("Fusion: qualified API names and object methods, named the way the API reference indexes them", () => {
    const names = parseApiCalls(FUSION, "fusion").map((c) => c.name);
    for (const n of ["Application.get", "Design.cast", "Sketches.add", "SketchLines.addTwoPointRectangle", "Point3D.create", "ValueInput.createByReal", "addSimple", "FeatureOperations.NewBodyFeatureOperation"])
      expect(names).toContain(n);
    expect(names).not.toContain("format_exc");
  });

  it("iLogic: iLogic snippet functions and API members", () => {
    const names = parseApiCalls(ILOGIC, "ilogic").map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["iProperties.ValueInDoc", "ThisDoc.Document", "Parameter", "iLogicVb.UpdateWhenDone"]));
  });

  it("caps at 12 calls, keeping qualified names first", () => {
    const code = Array.from({ length: 20 }, (_, i) => `x${i} = fn${i}(1); y${i} = pkg.mod.call${i}(2);`).join("\n");
    const calls = parseApiCalls(code, "matlab");
    expect(calls).toHaveLength(12);
    expect(calls.every((c) => c.name.includes("."))).toBe(true);
  });
});

describe("call verdicts: only the docs decide", () => {
  const call = { name: "matlab.addons.install", kind: "function" as const, lines: [2] };
  const docs = [{ id: 1, text: "matlab.addons.install is not recommended. Use mpminstall instead. There are no plans to remove matlab.addons.install." }];
  const raw = { status: "deprecated" as const, replacement: "mpminstall", sourceIds: [1], evidence: "Not recommended; use mpminstall.", quote: "matlab.addons.install is not recommended. Use mpminstall instead.", note: "" };

  it("a deprecated call keeps its documented replacement and real quote", () => {
    expect(mapCallVerdict(call, raw, docs)).toMatchObject({ status: "deprecated", replacement: "mpminstall", sourceIds: [1], sourceQuote: raw.quote });
  });

  it("no page that was read mentions the call: not found in the docs searched (no model verdict)", () => {
    expect(mapCallVerdict(call, raw, [{ id: 2, text: "Install add-ons from the Add-On Explorer." }])).toMatchObject({ status: "not_found", sourceIds: [] });
  });

  it("a status without a valid cited page becomes unverifiable; an invented quote is dropped", () => {
    expect(mapCallVerdict(call, { ...raw, status: "current", sourceIds: [9] }, docs).status).toBe("unverifiable");
    expect(mapCallVerdict(call, { ...raw, quote: "matlab.addons.install was removed in R2026b." }, docs).sourceQuote).toBe("");
  });

  it("the judge prompt is docs-only and treats the code as data", () => {
    expect(CODE_JUDGE_SYSTEM).toMatch(/never from your own knowledge/);
    expect(CODE_JUDGE_SYSTEM).toMatch(/never instructions/);
  });
});

describe("docs retrieval rules (Fusion boilerplate fix)", () => {
  it("a page mentions a dotted call only with the full name, or its class and member as whole words", () => {
    const get = { name: "Application.get" };
    expect(mentionsCall(get, "Application.get Method. Returns the Application object.")).toBe(true);
    expect(mentionsCall(get, "The Application object ... call get() to obtain it.")).toBe(true);
    expect(mentionsCall(get, "To get started, open the release notes.")).toBe(false); // "get" alone isn't enough
    expect(mentionsCall({ name: "plot" }, "plot(X,Y) creates a 2-D line plot")).toBe(true);
    expect(mentionsCall({ name: "plot" }, "subplot and plotting tools")).toBe(false);
  });

  it("Fusion and Inventor queries leave out the release (build numbers match release notes); MATLAB keeps it", () => {
    expect(codeQuery({ name: "Application.get" }, CODE_APPS.fusion, "v.2706.1.17")).toBe("Fusion API reference Application.get");
    expect(codeQuery({ name: "iProperties.Value" }, CODE_APPS.ilogic, "Inventor 2027.2")).toBe("Inventor iLogic and API reference iProperties.Value");
    expect(codeQuery({ name: "readtable" }, CODE_APPS.matlab, "R2026b")).toBe("MATLAB function reference readtable R2026b");
    expect(fallbackCodeQuery({ name: "Design.cast", kind: "method" }, CODE_APPS.fusion)).toBe("Autodesk Fusion API Design.cast method");
  });
});

describe("corrected code", () => {
  const flagged = [{ name: "matlab.addons.install", lines: [2], replacement: "mpminstall", sourceIds: [1] }];
  it("changes only flagged lines, and only to use the documented replacement", () => {
    const edits = acceptEdits(MATLAB, flagged, [
      { line: 2, corrected: 'mpminstall("MyToolbox.mltbx");' },
      { line: 4, corrected: "scatter(T.x, T.y);" }, // not a flagged line
      { line: 2, corrected: 'mpminstall("other");' }, // second edit to the same line
    ]);
    expect(edits).toEqual([{ line: 2, original: 'matlab.addons.install("MyToolbox.mltbx");', corrected: 'mpminstall("MyToolbox.mltbx");', call: "matlab.addons.install", sourceIds: [1] }]);
    const out = applyEdits(MATLAB, edits).split("\n");
    expect(out[1]).toBe('mpminstall("MyToolbox.mltbx");');
    expect(out.filter((l, i) => l !== MATLAB.split("\n")[i])).toHaveLength(1);
  });

  it("rejects an edit that doesn't use the replacement", () => {
    expect(acceptEdits(MATLAB, flagged, [{ line: 2, corrected: 'addons.installNew("MyToolbox.mltbx");' }])).toEqual([]);
  });
});

/** Fakes shaped like MathWorks reference pages. */
function fakes(opts: { searchError?: () => Error } = {}) {
  const searches: SearchParams[] = [];
  const pages: Record<string, string> = {
    "https://www.mathworks.com/help/matlab/ref/matlab.addons.install.html":
      "# matlab.addons.install\n\nmatlab.addons.install is not recommended. Use mpminstall instead. There are no plans to remove matlab.addons.install. Install add-on from a file.",
    "https://www.mathworks.com/help/matlab/ref/readtable.html": "# readtable\n\nreadtable creates a table from a file. T = readtable(filename) creates a table by reading column-oriented data from a text file or spreadsheet.",
    "https://www.mathworks.com/help/matlab/ref/plot.html": "# plot\n\nplot creates a 2-D line plot. plot(X,Y) creates a 2-D line plot of the data in Y versus the corresponding values in X.",
    "https://www.mathworks.com/products/new_products/latest_features.html": "# Release R2026b\n\nMATLAB R2026b is the latest release.",
  };
  const hit = (url: string, rank: number): SearchHit => ({ url, title: url.split("/").at(-1)!, description: pages[url]!.slice(0, 80), snippets: [], rank, kind: "web" });
  const you: SearchProvider = {
    search: vi.fn(async (p: SearchParams) => {
      searches.push(p);
      if (opts.searchError) throw opts.searchError();
      if (/latest release/.test(p.query)) return [hit("https://www.mathworks.com/products/new_products/latest_features.html", 0)];
      const url = Object.keys(pages).find((u) => p.query.includes(u.split("/").at(-1)!.replace(".html", "")));
      return url ? [hit(url, 0), { ...hit("https://www.mathworks.com/products/new_products/latest_features.html", 1) }, { url: "https://www.reddit.com/r/matlab/x", title: "forum", description: "x", snippets: [], rank: 2, kind: "web" } as SearchHit] : [];
    }),
    contents: vi.fn(async (urls: string[]) => urls.map((url) => ({ url, markdown: pages[url] ?? null, status: pages[url] ? ("ok" as const) : ("failed" as const) }))),
  };
  const roles: string[] = [];
  const meta = { model: "m", usage: { inputTokens: 1, outputTokens: 1 }, failedOver: false };
  const claude = {
    json: vi.fn(async (i: CallInput) => {
      roles.push(i.role);
      if (i.role === "release") return { data: { release: "R2026b", resultIndex: 0 }, ...meta };
      if (i.role === "verify") {
        const name = /<call>(.*?)<\/call>/.exec(String(i.prompt))![1]!;
        if (name === "matlab.addons.install")
          return { data: { status: "deprecated", replacement: "mpminstall", sourceIds: [1], evidence: "Not recommended; use mpminstall.", quote: "Use mpminstall instead.", note: "" }, ...meta };
        const id = Number(/<source id="(\d+)"[^>]*>[^<]*?#\s*(\w+)/.exec(String(i.prompt))![1]);
        return { data: { status: "current", replacement: "", sourceIds: [id], evidence: `${name} is documented.`, quote: "", note: "" }, ...meta };
      }
      if (i.role === "repair") return { data: { edits: [{ line: 2, corrected: 'mpminstall("MyToolbox.mltbx");' }] }, ...meta };
      throw new Error(`unexpected role ${i.role}`);
    }),
    stream: vi.fn(),
  } as unknown as LlmProvider;
  return { you, claude, searches, roles };
}

describe("checkCode pipeline (fixtures)", () => {
  it("flags matlab.addons.install with the cited mpminstall replacement and corrects only that line", async () => {
    const { you, claude, searches } = fakes();
    const events: CodeCheckEvent[] = [];
    for await (const e of checkCode(MATLAB, { you, claude, now: () => NOW })) events.push(e);
    expect(events[0]).toMatchObject({ type: "code_parsed", lang: "matlab", calls: [{ name: "matlab.addons.install" }, { name: "readtable" }, { name: "plot" }] });
    expect(events[1]).toMatchObject({ type: "release", release: "R2026b", source: { kind: "lookup" } });
    expect(events.filter((e) => e.type === "call_verdict")).toHaveLength(3);
    const r = (events.at(-1) as Extract<CodeCheckEvent, { type: "code_done" }>).receipts;
    expect(r.calls.map((c) => [c.name, c.status])).toEqual([
      ["matlab.addons.install", "deprecated"],
      ["readtable", "current"],
      ["plot", "current"],
    ]);
    expect(r.calls[0]).toMatchObject({ replacement: "mpminstall" });
    expect(r.edits).toHaveLength(1);
    expect(r.corrected.split("\n")[1]).toBe('mpminstall("MyToolbox.mltbx");');
    expect(r.summary).toBe("2 current · 1 deprecated · 0 removed · 0 not found · 0 unverifiable");
    expect(r.scope).toBe(CODE_CHECK_SCOPE);
    expect(r.scope).toMatch(/doesn't run the code/);
    // Every call search is limited to the vendor's official docs, and non-docs results are dropped.
    for (const s of searches.filter((q) => !/latest release/.test(q.query))) expect(s.includeDomains).toEqual(["mathworks.com"]);
    expect(r.sources.every((s) => s.domain.endsWith("mathworks.com"))).toBe(true);
  });

  it("uses the target release the user gives, without a lookup", async () => {
    const { you, claude, roles } = fakes();
    const r = await checkCodeToReceipts(MATLAB, { you, claude, now: () => NOW, release: "R2026a" });
    expect(r.release).toBe("R2026a");
    expect(r.releaseSource.kind).toBe("user");
    expect(roles).not.toContain("release");
  });

  it("out of search credit (recorded 402): live search is unavailable", async () => {
    const { you, claude } = fakes({ searchError: () => new HttpError(fx402.status, fx402.url, fx402.body) });
    const r = await checkCodeToReceipts(MATLAB, { you, claude, now: () => NOW, release: "R2026b" });
    expect(r.outcome).toBe("search_unavailable");
    expect(r.message).toBe(SEARCH_UNAVAILABLE_MESSAGE);
  });

  it("code with no API calls ends without searching", async () => {
    const { you, claude, searches } = fakes();
    const r = await checkCodeToReceipts("% just a comment\nx = 1;", { you, claude, now: () => NOW });
    expect(r.outcome).toBe("no_calls");
    expect(searches).toHaveLength(0);
  });
});
