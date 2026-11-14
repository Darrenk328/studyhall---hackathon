import { describe, expect, it, vi } from "vitest";
import collision from "./fixtures/fusion-collision.json" with { type: "json" };
import { getCategory } from "../src/categories/registry.js";
import type { CallInput, JsonResult, TextResult } from "../src/providers/claude.js";
import type { SearchHit, SearchParams } from "../src/providers/you.js";
import { answerSystemPrompt, answerUserPrompt } from "../src/pipeline/answer.js";
import { appFromName, canonicalize, disambiguateQueries, resolveApps, searchCategory, softwareLine } from "../src/pipeline/apps.js";
import { calledFunctions, checkCode, extractCodeBlocks } from "../src/pipeline/code.js";
import { planQueries } from "../src/pipeline/plan.js";
import { computeConfidence } from "../src/pipeline/receipts.js";
import { answerToReceipts } from "../src/pipeline/run.js";
import { searchAll } from "../src/pipeline/search.js";
import { siteOf } from "../src/pipeline/text.js";
import type { Claim, LlmProvider, ReadSource, Source } from "../src/pipeline/types.js";

const NOW = new Date("2026-11-13T12:00:00Z");
const eng = getCategory("engineering")!;
const app = (id: string) => eng.apps!.find((a) => a.id === id)!;

/** A planner that returns fixed queries (and software/version for version-aware categories). */
function planner(queries: string[], software: string | null = null, version: string | null = null) {
  const calls: CallInput[] = [];
  const claude = {
    json: vi.fn(async (input: CallInput): Promise<JsonResult<unknown>> => {
      calls.push(input);
      return { data: { queries, software, version }, model: "claude-haiku-5-5", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
    }),
  } as unknown as LlmProvider;
  return { claude, calls };
}

describe("app resolution", () => {
  it("bare Fusion is Autodesk Fusion; sensor fusion or a MATLAB mention is MATLAB", () => {
    expect(resolveApps("How do I add a fillet in Fusion?", eng)).toMatchObject({ how: "named", apps: [{ id: "fusion" }] });
    expect(resolveApps("How do I use sensor fusion to track objects?", eng).apps.map((a) => a.id)).toEqual(["matlab"]);
    expect(resolveApps("Fusion toolbox in MATLAB R2026a", eng).apps.map((a) => a.id)).toEqual(["matlab"]);
    expect(resolveApps("Is Fusion 360 better than MATLAB for this?", eng).apps.map((a) => a.id).sort()).toEqual(["fusion", "matlab"]);
    expect(resolveApps("How do I make a sheet metal flange?", eng)).toEqual({ apps: [], how: "unspecified" });
  });

  it("a selected app wins over the question text", () => {
    expect(resolveApps("What's new?", eng, "inventor")).toMatchObject({ how: "selected", apps: [{ id: "inventor" }] });
    expect(resolveApps("sensor fusion", eng, "fusion").apps[0]!.id).toBe("fusion");
  });

  it("maps planner names to apps", () => {
    expect(appFromName("SolidWorks", eng)?.id).toBe("solidworks");
    expect(appFromName("Autodesk Fusion", eng)?.id).toBe("fusion");
    expect(appFromName("Blender", eng)).toBeUndefined();
  });
});

describe("query disambiguation", () => {
  it("rewrites bare names without doubling them", () => {
    expect(canonicalize("fusion sketch constraints", app("fusion"))).toBe("Autodesk Fusion sketch constraints");
    expect(canonicalize("Autodesk Fusion 360 release notes", app("fusion"))).toBe("Autodesk Fusion release notes");
    expect(canonicalize("inventor sheet metal flange", app("inventor"))).toBe("Autodesk Inventor sheet metal flange");
  });

  it("a bare 'Fusion' question plans queries that all say 'Autodesk Fusion'", async () => {
    const { claude } = planner(["Fusion fillet edges", "how to fillet in fusion 2026", "fillet tool tutorial"]);
    const q = "How do I add a fillet in Fusion?";
    const plan = await planQueries(claude, q, eng, NOW, [], resolveApps(q, eng));
    expect(plan.queries.length).toBeGreaterThanOrEqual(2);
    for (const query of plan.queries) expect(query).toContain("Autodesk Fusion");
    expect(plan.queries.join(" ")).not.toMatch(/Autodesk Autodesk|(?<!Autodesk )Fusion/);
  });

  it("recent-change questions get release notes plus the year", () => {
    const resolved = resolveApps("What changed in the latest Autodesk Fusion update?", eng);
    const out = disambiguateQueries(["Fusion update changes"], "What changed in the latest Autodesk Fusion update?", resolved, NOW);
    expect(out).toContain("Autodesk Fusion release notes 2026");
  });

  it("MATLAB sensor-fusion queries are never rewritten to Autodesk", () => {
    const q = "How do I use sensor fusion to track objects in MATLAB?";
    const out = disambiguateQueries(["sensor fusion object tracking", "MATLAB trackerGNN example"], q, resolveApps(q, eng), NOW);
    expect(out.join(" ")).not.toContain("Autodesk");
    expect(out.every((x) => x.includes("MATLAB"))).toBe(true);
  });

  it("the planner asks for software and version on version-aware categories", async () => {
    const { claude, calls } = planner(["q"], "MATLAB", "R2025a");
    const plan = await planQueries(claude, "Does R2025a still install Java?", eng, NOW, [], resolveApps("Does R2025a still install Java?", eng));
    expect(plan).toMatchObject({ software: "MATLAB", version: "R2025a" });
    expect(calls[0]!.prompt).toMatch(/version: a release, version, build or year/);
  });
});

describe("Fusion collision, both directions (fixture)", () => {
  async function run(direction: "autodesk" | "matlab") {
    const f = collision[direction];
    const search = vi.fn(async (_p: SearchParams) => f.hits as SearchHit[]);
    const resolved = resolveApps(f.question, eng);
    const out = await searchAll({ search, contents: vi.fn() }, ["q1"], searchCategory(eng, resolved), NOW, { perQuery: 10, topN: 8 });
    return { resolved, domains: out.candidates.map((c) => c.domain), params: search.mock.calls[0]![0] };
  }

  it("Autodesk Fusion: MathWorks' sensor-fusion pages and the lookalike products are excluded", async () => {
    const { resolved, domains, params } = await run("autodesk");
    expect(resolved.apps[0]!.id).toBe("fusion");
    expect(domains).toEqual(["help.autodesk.com", "forums.autodesk.com"]);
    expect(params.excludeDomains).toEqual(expect.arrayContaining(["mathworks.com", "doc.photonengine.com", "fusionsignage.com.au"]));
    expect(params.boostDomains).not.toContain("mathworks.com");
  });

  it("MATLAB sensor fusion: Autodesk pages are excluded, MathWorks pages (any mirror) kept", async () => {
    const { resolved, domains, params } = await run("matlab");
    expect(resolved.apps[0]!.id).toBe("matlab");
    expect(domains).toEqual(["mathworks.com", "uk.mathworks.com"]);
    expect(params.excludeDomains).toContain("autodesk.com");
    expect(params.boostDomains).not.toContain("help.autodesk.com");
  });
});

describe("independence counts sites", () => {
  it("regional mirrors and subdomains are one site", () => {
    expect(siteOf("uk.mathworks.com")).toBe("mathworks.com");
    expect(siteOf("help.autodesk.com")).toBe(siteOf("forums.autodesk.com"));
    expect(siteOf("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(siteOf("cdc.gov")).toBe("cdc.gov");
  });

  it("mathworks.com plus uk.mathworks.com is one authority with 2 pages, not 2 domains", () => {
    const src = (id: number, domain: string): Source => ({ id, url: `https://${domain}/p${id}`, title: "t", domain, score: 1, foundBy: [], preferred: true, authority: true, readStatus: "full", cited: true, published: "2026-11-01T00:00:00Z" });
    const claim: Claim = { text: "x", sourceIds: [1], verdict: "supported", note: "", evidence: "", span: null };
    const r = computeConfidence([claim], [src(1, "mathworks.com"), src(2, "uk.mathworks.com")], eng, NOW);
    expect(r.confidence).toBe("high");
    expect(r.reasons[0]).toMatch(/2 pages from mathworks\.com/);
  });
});

describe("version-aware prompts", () => {
  it("the answer prompt requires the release line, sourced syntax and fenced code", () => {
    const sys = answerSystemPrompt(eng, NOW);
    expect(sys).toMatch(/Open with one sentence naming the software and the exact release or build/);
    expect(sys).toMatch(/never from memory/);
    expect(sys).toMatch(/not recommended/);
    expect(sys).toMatch(/fenced code blocks/);
    expect(answerSystemPrompt(getCategory("health")!, NOW)).not.toMatch(/exact release or build/);
  });

  it("the user prompt says which software, or asks the answer to state its assumption", () => {
    expect(answerUserPrompt("q", [], [], softwareLine(resolveApps("q", eng, "matlab"), "R2026b"))).toContain("Software: The user selected MATLAB. The user mentioned this version or release: R2026b.");
    expect(softwareLine(resolveApps("How do I make a flange?", eng), null)).toMatch(/Say which app you assumed/);
  });
});

describe("code checks", () => {
  const answer = [
    "Based on MATLAB R2026b, install add-ons with mpminstall [1].",
    "",
    "```matlab",
    "% install a package",
    "pkg = mpminstall(\"MyToolbox\");",
    "matlab.addons.install(\"old.mltbx\")",
    "disp('done')",
    "result = pkg.Version;",
    "```",
    "",
    "See the release notes [1][2].",
  ].join("\n");
  const src = (id: number, text: string): ReadSource => ({ id, url: `https://mathworks.com/${id}`, title: "t", domain: "mathworks.com", score: 1, foundBy: [], preferred: true, authority: true, readStatus: "full", cited: false, text });

  it("extracts code blocks and called functions, skipping comments, strings and variables", () => {
    const [b] = extractCodeBlocks(answer);
    expect(b!.lang).toBe("matlab");
    expect(calledFunctions(b!.code, "matlab")).toEqual(["mpminstall", "matlab.addons.install", "disp"]);
    expect(calledFunctions("x = linspace(0, 1, 5);\ny = x(2);\nplot(x, y)\nhold on", "matlab")).toEqual(["linspace", "plot", "hold"]);
  });

  it("a function in a cited source is supported; one that isn't is partial 'not found in sources'", () => {
    const claims = checkCode(answer, [
      src(1, "R2026b: Use mpminstall to install packages. matlab.addons.install is not recommended."),
      src(2, "Release notes."),
      src(3, "disp displays the value of a variable."),
    ]);
    expect(claims.map((c) => [c.text, c.verdict, c.sourceIds])).toEqual([
      ["mpminstall", "supported", [1]],
      ["matlab.addons.install", "supported", [1]],
      ["disp", "partial", []],
    ]);
    expect(claims[2]!.note).toBe("Not found in the cited sources (it appears in uncited source 3).");
    expect(claims.every((c) => c.kind === "code" && c.span && answer.slice(c.span.start, c.span.end) === c.text)).toBe(true);
  });

  it("in the pipeline, code claims are appended and a partial one keeps confidence below High", async () => {
    const url = "https://www.mathworks.com/help/matlab/ref/mpminstall.html";
    const url2 = "https://www.mathworks.com/help/matlab/release-notes.html";
    const page = "# mpminstall\n\nmpminstall installs a package (R2026b). It replaces matlab.addons.install, which is not recommended.\n\nRelease R2026b.";
    const hit = (u: string, rank: number): SearchHit => ({ url: u, title: "mpminstall - MATLAB", description: "Install package", snippets: [], pageAge: "2026-11-01T00:00:00", rank, kind: "web" });
    const you = { search: vi.fn(async () => [hit(url, 0), hit(url2, 1)]), contents: vi.fn(async (urls: string[]) => urls.map((u) => ({ url: u, markdown: page, status: "ok" as const }))) };
    const text = "Based on MATLAB R2026b, use mpminstall [1].\n\n```matlab\nmpminstall(\"pkg\")\nfrobnicate(1)\n```\n\nThis replaces matlab.addons.install [1][2].";
    const claude = {
      json: vi.fn(async (input: CallInput) => {
        const meta = { model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
        if (input.role === "plan") return { data: { queries: ["mpminstall"], software: "MATLAB", version: null }, ...meta };
        if (input.role === "notes") return { data: { focus: "f", keyPoints: [], conflicts: [], mayBeStale: [] }, ...meta };
        return {
          data: {
            claims: [
              { text: "Based on MATLAB R2026b, use mpminstall [1].", sourceIds: [1], contradicted: false, verdict: "supported", note: "", evidence: "" },
              { text: "This replaces matlab.addons.install [1][2].", sourceIds: [1, 2], contradicted: false, verdict: "supported", note: "", evidence: "" },
            ],
          },
          ...meta,
        };
      }),
      async *stream(): AsyncGenerator<string, TextResult> {
        yield text;
        return { text, truncated: false, model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
      },
    } as unknown as LlmProvider;
    const r = await answerToReceipts("Which function replaces matlab.addons.install?", "engineering", { you, claude, now: () => NOW });
    expect(r.software).toEqual({ apps: [{ id: "matlab", name: "MATLAB" }], how: "named", version: null });
    const code = r.claims.filter((c) => c.kind === "code");
    expect(code.map((c) => [c.text, c.verdict])).toEqual([
      ["mpminstall", "supported"],
      ["frobnicate", "partial"],
    ]);
    expect(code[1]!.note).toBe("Not found in sources.");
    expect(r.confidence).toBe("medium");
  });
});

describe("version-aware search and calibration", () => {
  it("searches with and without the date filter, so older official docs still come back", async () => {
    const search = vi.fn(async (p: SearchParams) => [
      { url: p.freshness ? "https://forums.autodesk.com/t/1" : "https://help.autodesk.com/view/INVNTOR/2027/ENU/?guid=Flange", title: "t", description: "d", snippets: [], rank: 0, kind: "web" as const },
      { url: p.freshness ? "https://forums.autodesk.com/t/2" : "https://help.autodesk.com/view/INVNTOR/2027/ENU/?guid=Face", title: "t", description: "d", snippets: [], rank: 1, kind: "web" as const },
      { url: p.freshness ? "https://forums.autodesk.com/t/3" : "https://help.autodesk.com/view/INVNTOR/2027/ENU/?guid=Cut", title: "t", description: "d", snippets: [], rank: 2, kind: "web" as const },
    ]);
    const out = await searchAll({ search, contents: vi.fn() }, ["Autodesk Inventor flange"], eng, NOW, { perQuery: 10, topN: 8, alsoUndated: true });
    expect(search.mock.calls.map((c) => c[0].freshness)).toEqual(["month", undefined]);
    expect(out.candidates.some((c) => c.domain === "help.autodesk.com")).toBe(true);
    expect(out.freshnessRelaxed).toBe(false);
  });

  it("an answer that is mostly meta can't be High", () => {
    const src = (id: number): Source => ({ id, url: `https://help.autodesk.com/p${id}`, title: "t", domain: "help.autodesk.com", score: 1, foundBy: [], preferred: true, authority: true, readStatus: "full", cited: true, published: "2026-11-01T00:00:00Z" });
    const c = (verdict: Claim["verdict"]): Claim => ({ text: "x", sourceIds: [1], verdict, note: "", evidence: "", span: null });
    const r = computeConfidence([c("supported"), c("meta"), c("meta"), c("meta")], [src(1), src(2)], eng, NOW);
    expect(r).toMatchObject({ confidence: "medium", reasons: ["Most of the answer is about what the sources do or don't cover."] });
    expect(computeConfidence([c("supported"), c("supported"), c("meta")], [src(1), src(2)], eng, NOW).confidence).toBe("high");
  });
});

describe("fresh page copies for version-aware categories", () => {
  it("engineering reads refuse cached copies older than 3 days and allow an 8s crawl; other categories don't", async () => {
    const mk = () => {
      const contents = vi.fn(async (urls: string[], _o?: unknown) => urls.map((url) => ({ url, markdown: "# Release notes\n\nbuild v.2706.1.17 (October 29)\n\n" + "Details. ".repeat(20), status: "ok" as const })));
      const search = vi.fn(async () => [{ url: "https://help.autodesk.com/notes", title: "Release notes", description: "d", snippets: [], rank: 0, kind: "web" as const }]);
      return { you: { search, contents }, contents };
    };
    const claude = {
      json: vi.fn(async (i: CallInput) => ({ data: i.role === "plan" ? { queries: ["q"], software: null, version: null } : i.role === "notes" ? { focus: "f", keyPoints: [], conflicts: [], mayBeStale: [] } : { claims: [] }, model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false })),
      async *stream(): AsyncGenerator<string, TextResult> {
        yield "a [1].";
        return { text: "a [1].", truncated: false, model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
      },
    } as unknown as LlmProvider;
    const e = mk();
    await answerToReceipts("Latest Autodesk Fusion build?", "engineering", { you: e.you, claude, now: () => NOW });
    expect(e.contents.mock.calls[0]![1]).toMatchObject({ crawlTimeoutSec: 8, maxAgeSec: 259_200 });
    const t = mk();
    await answerToReceipts("Latest Node.js LTS?", "tech", { you: t.you, claude, now: () => NOW });
    expect(t.contents.mock.calls[0]![1]).toEqual({ crawlTimeoutSec: 5 });
  });
});
