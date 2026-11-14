import { describe, expect, it, vi } from "vitest";
import { getCategory } from "../src/categories/registry.js";
import type { CallInput, TextResult } from "../src/providers/claude.js";
import type { SearchHit, SearchParams } from "../src/providers/you.js";
import {
  assessCitedDocs,
  checkExtraction,
  mentionsCurrentRelease,
  prependOlderDocsNote,
  releaseKey,
  releaseQuery,
  releaseTerms,
  type CurrentRelease,
} from "../src/pipeline/release.js";
import { answerToReceipts } from "../src/pipeline/run.js";
import type { Claim, LlmProvider } from "../src/pipeline/types.js";

const NOW = new Date("2026-11-13T12:00:00Z");
const eng = getCategory("engineering")!;
const inventor = eng.apps!.find((a) => a.id === "inventor")!;
const cr: CurrentRelease = { appId: "inventor", appName: "Autodesk Inventor", release: "Inventor 2027.2", source: { url: "https://www.autodesk.com/blogs/inventor-2027-2", title: "Autodesk Inventor 2027.2 what's new" }, sourceId: 5 };
const hit = (url: string, title: string, rank: number, extra = ""): SearchHit => ({ url, title, description: extra, snippets: [], rank, kind: "web" });

describe("release numbers", () => {
  it("compares years and MATLAB releases; minor updates count as their year; builds aren't compared", () => {
    expect(releaseKey("Inventor 2027.2")).toBe(20270);
    expect(releaseKey("help.autodesk.com/view/INVNTOR/2026/ENU")).toBe(20260);
    expect(releaseKey("R2026b")).toBeGreaterThan(releaseKey("R2026a")!);
    expect(releaseKey("R2026a")).toBeGreaterThan(releaseKey("R2025b")!);
    expect(releaseKey("v.2706.1.17")).toBeNull();
    expect(releaseTerms("Inventor 2027.2")).toEqual(["2027.2", "2027"]);
    expect(releaseTerms("MATLAB R2026b")).toEqual(["r2026b"]);
  });

  it("only accepts a release the chosen result actually states", () => {
    const hits = [hit("https://a/1", "Inventor 2026 what's new", 0), hit("https://a/2", "Autodesk Inventor 2027.2 what's new", 1)];
    expect(checkExtraction(hits, "Inventor 2027.2", 1)?.url).toBe("https://a/2");
    expect(checkExtraction(hits, "Inventor 2027.2", 0)).toBeUndefined();
    expect(checkExtraction(hits, "Inventor 2028", 1)).toBeUndefined();
    expect(checkExtraction(hits, null, null)).toBeUndefined();
  });

  it("builds a release-first query from the planner's first query", () => {
    expect(releaseQuery("Autodesk Inventor 2026 sheet metal flange tutorial", inventor, "Inventor 2027.2")).toBe("Inventor 2027.2 sheet metal flange tutorial");
    expect(releaseQuery("MATLAB install add-on", { ...inventor, name: "MATLAB" }, "R2026b")).toBe("MATLAB R2026b install add-on");
  });
});

describe("older docs", () => {
  const cited = (urls: [string, string][]) => urls.map(([url, title], i) => ({ id: i + 1, url, title }));

  it("flags docs for an older release than the current one, ignoring the release source itself", () => {
    expect(assessCitedDocs(cr, cited([["https://help.autodesk.com/view/INVNTOR/2026/ENU/?guid=Flange", "To Create a Flange"], [cr.source.url, cr.source.title]]))).toEqual({
      olderDocs: true,
      citedReleases: ["2026"],
    });
    expect(assessCitedDocs(cr, cited([["https://help.autodesk.com/view/INVNTOR/2027/ENU/?guid=Flange", "To Create a Flange"]])).olderDocs).toBe(false);
    expect(assessCitedDocs(cr, cited([["https://forums.autodesk.com/t/1", "Flange question"]])).olderDocs).toBe(false);
  });

  it("detects when the answer already says so, and otherwise prepends a cited note with shifted spans", () => {
    expect(mentionsCurrentRelease("Inventor 2027.2 is the current release [5]; these steps come from the 2026 help.", cr)).toBe(true);
    expect(mentionsCurrentRelease("Based on Autodesk Inventor 2026 Help [3].", cr)).toBe(false);
    const claim: Claim = { text: "Click Flange [3].", sourceIds: [3], verdict: "supported", note: "", evidence: "", span: { start: 0, end: 17 } };
    const out = prependOlderDocsNote("Click Flange [3].", [claim], cr, ["2026"]);
    expect(out.note).toBe("Inventor 2027.2 is the current release [5]; the steps below come from 2026 documentation and may differ slightly.");
    expect(out.text.slice(out.claims[0]!.span!.start, out.claims[0]!.span!.end)).toBe("Click Flange [3].");
  });
});

describe("pipeline: Inventor flange with 2026 docs while 2027.2 is current", () => {
  const releaseHit = hit("https://www.autodesk.com/blogs/design-and-manufacturing/autodesk-inventor-2027-2-whats-new/", "Autodesk Inventor 2027.2 what's new", 0, "Inventor 2027.2 is now available.");
  const docHit = hit("https://help.autodesk.com/view/INVNTOR/2026/ENU/?guid=GUID-Flange", "To Create a Flange | Inventor 2026 Help", 0, "Flange command steps.");
  const forumHit = hit("https://forums.autodesk.com/t5/inventor/flange/td-p/1", "Flange tips", 1, "Forum.");

  function setup(answerText: string) {
    const queries: SearchParams[] = [];
    const you = {
      search: vi.fn(async (p: SearchParams) => {
        queries.push(p);
        return /latest release/.test(p.query) ? [releaseHit] : [docHit, forumHit];
      }),
      contents: vi.fn(async (urls: string[]) => urls.map((url) => ({ url, markdown: `# Page\n\n${"Sheet metal flange steps for Inventor. ".repeat(6)}`, status: "ok" as const }))),
    };
    const roles: string[] = [];
    const claude = {
      json: vi.fn(async (i: CallInput) => {
        roles.push(i.role);
        const meta = { model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
        if (i.role === "release") return { data: { release: "Inventor 2027.2", resultIndex: 0 }, ...meta };
        if (i.role === "plan") return { data: { queries: ["Autodesk Inventor sheet metal flange steps"], software: "Autodesk Inventor", version: null }, ...meta };
        if (i.role === "notes") return { data: { focus: "f", keyPoints: [], conflicts: [], mayBeStale: [] }, ...meta };
        return { data: { claims: [{ text: "Click Flange on the Sheet Metal tab [1].", sourceIds: [1], contradicted: false, verdict: "supported", note: "", evidence: "" }] }, ...meta };
      }),
      async *stream(i: CallInput): AsyncGenerator<string, TextResult> {
        roles.push(`answer:${String(i.prompt).includes("The current release is Inventor 2027.2") ? "told" : "not-told"}`);
        yield answerText;
        return { text: answerText, truncated: false, model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
      },
    } as unknown as LlmProvider;
    return { you, claude, queries, roles };
  }

  it("records the current release, searches for its docs first, adds the note when the answer forgot, and caps confidence", async () => {
    const { you, claude, queries, roles } = setup("Click Flange on the Sheet Metal tab [1].");
    const r = await answerToReceipts("How do I make a sheet metal flange in Inventor?", "engineering", { you, claude, now: () => NOW });
    expect(r.currentRelease).toMatchObject({ release: "Inventor 2027.2", source: { url: releaseHit.url }, olderDocs: true, citedReleases: ["2026"] });
    expect(queries.find((q) => !/latest release/.test(q.query))!.query).toBe("Inventor 2027.2 sheet metal flange steps");
    expect(roles).toContain("answer:told");
    expect(r.answer.startsWith(`Inventor 2027.2 is the current release [${r.currentRelease!.sourceId}]; the steps below come from 2026 documentation`)).toBe(true);
    for (const c of r.claims) if (c.span) expect(r.answer.slice(c.span.start, c.span.end)).toBe(c.text);
    expect(r.confidence).not.toBe("high");
    expect(r.confidenceReasons.join(" ")).toMatch(/current release is Inventor 2027.2/);
    expect(typeof r.timingsMs.release).toBe("number");
  });

  it("doesn't add a note when the answer already said so", async () => {
    const { you, claude } = setup("Inventor 2027.2 is the current release [3]; these steps come from the Inventor 2026 help. Click Flange on the Sheet Metal tab [1].");
    const r = await answerToReceipts("How do I make a sheet metal flange in Inventor?", "engineering", { you, claude, now: () => NOW });
    expect(r.answer.startsWith("Inventor 2027.2 is the current release [3]")).toBe(true);
    expect(r.warnings.join(" ")).not.toMatch(/note was added/);
  });

  it("skips the lookup when the user names a version", async () => {
    const { you, claude, roles } = setup("Click Flange [1].");
    (claude.json as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (i: CallInput) => {
      roles.push(i.role);
      const meta = { model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
      if (i.role === "plan") return { data: { queries: ["Inventor 2025 flange"], software: "Autodesk Inventor", version: "2025" }, ...meta };
      if (i.role === "release") return { data: { release: "Inventor 2027.2", resultIndex: 0 }, ...meta };
      if (i.role === "notes") return { data: { focus: "f", keyPoints: [], conflicts: [], mayBeStale: [] }, ...meta };
      return { data: { claims: [] }, ...meta };
    });
    const r = await answerToReceipts("How do I make a flange in Inventor 2025?", "engineering", { you, claude, now: () => NOW });
    expect(r.currentRelease).toBeUndefined();
    expect(r.software?.version).toBe("2025");
  });
});
