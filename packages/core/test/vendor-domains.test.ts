import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/vendor-domains.json" with { type: "json" };
import { getCategory } from "../src/categories/registry.js";
import type { CallInput, TextResult } from "../src/providers/claude.js";
import type { SearchHit, SearchParams } from "../src/providers/you.js";
import { answerUserPrompt, CHANGELOG_SHAPE, isChangelogQuestion } from "../src/pipeline/answer.js";
import { resolveApps, searchCategory, versionInQuestion } from "../src/pipeline/apps.js";
import { releaseQuery, sourceKind } from "../src/pipeline/release.js";
import { answerToReceipts } from "../src/pipeline/run.js";
import { searchAll } from "../src/pipeline/search.js";
import { matchesAny } from "../src/pipeline/text.js";
import type { LlmProvider } from "../src/pipeline/types.js";

const NOW = new Date("2026-11-14T12:00:00Z");
const eng = getCategory("engineering")!;
const app = (id: string) => eng.apps!.find((a) => a.id === id)!;

describe("app-aware vendor domains (fixture)", () => {
  // The fake search ignores excludeDomains, so these tests check Studyhall's own filtering too.
  async function run(which: "solidworks" | "fusion") {
    const f = fixture[which];
    const search = vi.fn(async (_p: SearchParams) => f.hits as SearchHit[]);
    const resolved = resolveApps(f.question, eng);
    const out = await searchAll({ search, contents: vi.fn() }, ["q1"], searchCategory(eng, resolved), NOW, { perQuery: 10, topN: 8 });
    return { resolved, domains: out.candidates.map((c) => c.domain), params: search.mock.calls[0]![0] };
  }

  it("a SOLIDWORKS question doesn't rank Autodesk pages (or other vendors') in the top 8", async () => {
    const { resolved, domains, params } = await run("solidworks");
    expect(resolved.apps.map((a) => a.id)).toEqual(["solidworks"]);
    expect(domains.length).toBeGreaterThan(0);
    expect(domains.filter((d) => matchesAny(d, ["autodesk.com", "onshape.com", "mathworks.com"]))).toEqual([]);
    // SOLIDWORKS' own pages lead, and a non-vendor page (a reseller) is still allowed.
    expect(domains.slice(0, 3).every((d) => matchesAny(d, ["solidworks.com"]))).toBe(true);
    expect(domains).toContain("solidsolutions.co.uk");
    expect(params.excludeDomains).toEqual(expect.arrayContaining(["autodesk.com", "onshape.com", "ptc.com", "freecad.org", "mathworks.com"]));
    expect(params.excludeDomains).not.toContain("solidworks.com");
    expect(params.boostDomains).toEqual(["solidworks.com"]);
  });

  it("an Autodesk Fusion question doesn't rank SOLIDWORKS pages (or other vendors') in the top 8", async () => {
    const { resolved, domains, params } = await run("fusion");
    expect(resolved.apps.map((a) => a.id)).toEqual(["fusion"]);
    expect(domains.filter((d) => matchesAny(d, ["solidworks.com", "onshape.com", "ptc.com", "freecad.org", "mathworks.com"]))).toEqual([]);
    expect(domains).toEqual(expect.arrayContaining(["autodesk.com", "help.autodesk.com", "cadjunkie.com"]));
    expect(params.excludeDomains).toEqual(expect.arrayContaining(["solidworks.com", "onshape.com", "ptc.com", "freecad.org", "mathworks.com"]));
    expect(params.excludeDomains).not.toContain("autodesk.com");
    expect(params.boostDomains).toEqual(["autodesk.com"]);
  });

  it("Fusion and Inventor share Autodesk; MATLAB and Simulink share MathWorks: neither excludes its sibling", () => {
    const inventor = searchCategory(eng, { apps: [app("inventor")], how: "selected" });
    expect(inventor.blockedDomains).not.toContain("autodesk.com");
    expect(inventor.authorityDomains).toEqual(["autodesk.com"]);
    const simulink = searchCategory(eng, { apps: [app("simulink")], how: "selected" });
    expect(simulink.blockedDomains).not.toContain("mathworks.com");
    expect(simulink.blockedDomains).toContain("autodesk.com");
    expect(simulink.authorityDomains).toEqual(["mathworks.com"]);
  });

  it("vendors match on their main domain: SOLIDWORKS' blog counts as a SOLIDWORKS vendor site, like its help site", () => {
    const sw = searchCategory(eng, { apps: [app("solidworks")], how: "named" });
    for (const host of ["blogs.solidworks.com", "help.solidworks.com", "www.solidworks.com"]) {
      expect(matchesAny(host, sw.preferredDomains)).toBe(true);
      expect(matchesAny(host, sw.authorityDomains)).toBe(true);
    }
    expect(sourceKind("https://blogs.solidworks.com/products/solidworks/whats-new-in-solidworks-2027-design/", sw.authorityDomains)).toBe("official");
    // Same rule for every vendor: an official blog is official; a forum on the same domain is still a forum.
    expect(sourceKind("https://blogs.mathworks.com/matlab/2026/10/01/a-look-at-r2026b/", eng.authorityDomains)).toBe("official");
    expect(sourceKind("https://www.autodesk.com/products/fusion-360/blog/october-2026-update/", eng.authorityDomains)).toBe("official");
    expect(sourceKind("https://forums.autodesk.com/t5/fusion-design/x/td-p/1", eng.authorityDomains)).toBe("forum");
    for (const d of eng.authorityDomains) expect(d.split(".")).toHaveLength(2);
  });

  it("the SOLIDWORKS blog page in the fixture is ranked as preferred and authoritative", async () => {
    const f = fixture.solidworks;
    const out = await searchAll({ search: vi.fn(async () => f.hits as SearchHit[]), contents: vi.fn() }, ["q1"], searchCategory(eng, resolveApps(f.question, eng)), NOW, { perQuery: 10, topN: 8 });
    const blog = out.candidates.find((c) => c.domain === "blogs.solidworks.com")!;
    expect(blog).toMatchObject({ preferred: true, authority: true });
  });

  it("a generic question (no app) or a comparison (two apps) keeps the category-wide lists", () => {
    for (const q of ["How do I shell a part in CAD?", "Is SOLIDWORKS or Autodesk Fusion better for sheet metal?"]) {
      const c = searchCategory(eng, resolveApps(q, eng));
      expect(c.preferredDomains).toEqual(eng.preferredDomains);
      expect(c.authorityDomains).toEqual(eng.authorityDomains);
      expect(c.blockedDomains).toEqual(eng.blockedDomains);
    }
  });
});

describe("version named in the question", () => {
  it("finds versions written after the app's name, MATLAB releases and Fusion builds; not dates or 'Fusion 360'", () => {
    expect(versionInQuestion("What new fillet option did SOLIDWORKS 2027 add?", app("solidworks"))).toBe("2027");
    expect(versionInQuestion("How do I make a flange in Inventor 2027.2?", app("inventor"))).toBe("2027.2");
    expect(versionInQuestion("What changed in MATLAB R2026a?", app("matlab"))).toBe("R2026a");
    expect(versionInQuestion("Is v.2706.1.17 the latest Fusion build?", app("fusion"))).toBe("v.2706.1.17");
    expect(versionInQuestion("What's new in FreeCAD 1.1?", app("freecad"))).toBe("1.1");
    expect(versionInQuestion("How do I sketch in Fusion 360?", app("fusion"))).toBeNull();
    expect(versionInQuestion("What is the current MATLAB release?", app("matlab"))).toBeNull();
    expect(versionInQuestion("Which new sketch constraint did Onshape add in its October 30, 2026 update?", app("onshape"))).toBeNull();
  });
});

describe("release query", () => {
  it("doesn't repeat a release the planner's query already names", () => {
    expect(releaseQuery("MATLAB R2026b system requirements Java installation", app("matlab"), "R2026b")).toBe("MATLAB R2026b system requirements Java installation");
    expect(releaseQuery("SOLIDWORKS Inventor 2027.2 flange", app("inventor"), "Inventor 2027.2")).toBe("Inventor 2027.2 SOLIDWORKS flange");
  });
});

/** A fake pipeline: records every search and model role. */
function pipeline(plan: { queries: string[]; software: string | null; version: string | null }, release: string | null) {
  const searches: SearchParams[] = [];
  const roles: string[] = [];
  const releaseHit: SearchHit = { url: "https://www.mathworks.com/company/newsroom/release-2026b.html", title: "MathWorks introduces Release 2026b", description: "R2026b is available.", snippets: [], rank: 0, kind: "web" };
  const docHit: SearchHit = { url: "https://help.solidworks.com/2027/english/WhatsNew/c_wn2027_welcome.htm", title: "SOLIDWORKS 2027 What's New", description: "Fillets.", snippets: [], rank: 0, kind: "web" };
  const you = {
    search: vi.fn(async (p: SearchParams) => {
      searches.push(p);
      return /latest release/.test(p.query) ? [releaseHit] : [docHit];
    }),
    contents: vi.fn(async (urls: string[]) => urls.map((url) => ({ url, markdown: `# Page\n\n${"Release details for this product. ".repeat(6)}`, status: "ok" as const }))),
  };
  const claude = {
    json: vi.fn(async (i: CallInput) => {
      roles.push(i.role);
      const meta = { model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
      if (i.role === "plan") return { data: plan, ...meta };
      if (i.role === "release") return { data: { release, resultIndex: release ? 0 : null }, ...meta };
      if (i.role === "notes") return { data: { focus: "f", keyPoints: [], conflicts: [], mayBeStale: [] }, ...meta };
      return { data: { claims: [] }, ...meta };
    }),
    async *stream(): AsyncGenerator<string, TextResult> {
      yield "An answer [1].";
      return { text: "An answer [1].", truncated: false, model: "m", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
    },
  } as unknown as LlmProvider;
  return { you, claude, searches, roles };
}

describe("pipeline: release lookup", () => {
  it("is never started when the question names a version, so it spends no searches", async () => {
    const { you, claude, searches, roles } = pipeline({ queries: ["SOLIDWORKS 2027 fillet what's new", "SOLIDWORKS 2027 release notes fillet"], software: "SOLIDWORKS", version: "2027" }, "SOLIDWORKS 2027 SP1");
    const r = await answerToReceipts("What new fillet option did SOLIDWORKS 2027 add?", "engineering", { you, claude, now: () => NOW });
    expect(roles).not.toContain("release");
    expect(searches.filter((s) => /latest release/.test(s.query))).toEqual([]);
    expect(r.usage!.you.searches).toBe(2 * r.queries.length); // each query with and without the date filter, nothing else
    expect(r.currentRelease).toBeUndefined();
    expect(r.timingsMs.release).toBeUndefined();
  });

  it("still runs, after planning, when the text looks like a version but the planner reports none", async () => {
    const { you, claude, roles } = pipeline({ queries: ["MATLAB Java installation"], software: "MATLAB", version: null }, "R2026b");
    const r = await answerToReceipts("Does MATLAB 2026 still install Java?", "engineering", { you, claude, now: () => NOW });
    expect(roles).toContain("release");
    expect(r.currentRelease?.release).toBe("R2026b");
  });

  it("searches only the app's own vendor sites for the release", async () => {
    const { you, claude, searches } = pipeline({ queries: ["SOLIDWORKS fillet"], software: "SOLIDWORKS", version: null }, null);
    await answerToReceipts("How do I add a fillet in SOLIDWORKS?", "engineering", { you, claude, now: () => NOW });
    const lookups = searches.filter((s) => /latest release/.test(s.query));
    expect(lookups).toHaveLength(2);
    expect(lookups.find((s) => s.includeDomains)!.includeDomains).toEqual(["solidworks.com"]);
    expect(lookups.find((s) => s.boostDomains)!.excludeDomains).toContain("autodesk.com");
  });

  it("doesn't add a release query when the planner's first query already names the release", async () => {
    const { you, claude, searches } = pipeline({ queries: ["MATLAB R2026b system requirements Java", "MATLAB Java removal 2026"], software: "MATLAB", version: null }, "R2026b");
    const r = await answerToReceipts("Does installing MATLAB still install Java?", "engineering", { you, claude, now: () => NOW });
    expect(r.currentRelease?.release).toBe("R2026b");
    expect(r.queries.slice(0, 2)).toEqual(["MATLAB R2026b system requirements Java", "MATLAB Java removal 2026"]);
    expect(searches.filter((s) => /R2026b R2026b/.test(s.query))).toEqual([]);
    expect(r.usage!.you.searches).toBe(2 + 2 * r.queries.length); // release lookup + each query twice
  });

  it("adds the release query first when the planner's queries don't name it", async () => {
    const { you, claude } = pipeline({ queries: ["MATLAB install add-on replacement"], software: "MATLAB", version: null }, "R2026b");
    const r = await answerToReceipts("Which function replaces matlab.addons.install?", "engineering", { you, claude, now: () => NOW });
    expect(r.queries.slice(0, 2)).toEqual(["MATLAB R2026b install add-on replacement", "MATLAB install add-on replacement"]);
  });
});

describe("changelog questions", () => {
  it("are recognised by what's new / what changed / release notes wording, not by single-item questions", () => {
    for (const q of ["What's new in the latest MATLAB release?", "What changed in the latest Autodesk Fusion update?", "Summarize the Python 3.15 release notes", "What are the new features in Inventor 2027?"])
      expect(isChangelogQuestion(q)).toBe(true);
    for (const q of ["Which function replaces matlab.addons.install?", "Name one feature added in the latest Autodesk Fusion update.", "What new fillet option did SOLIDWORKS 2027 add?"])
      expect(isChangelogQuestion(q)).toBe(false);
  });

  it("ask the answer for the 5 or 6 most important changes and an offer to list the rest", () => {
    expect(answerUserPrompt("What's new in the latest MATLAB release?", [])).toContain(CHANGELOG_SHAPE);
    expect(CHANGELOG_SHAPE).toMatch(/5 or 6 most important/);
    expect(CHANGELOG_SHAPE).toMatch(/offering to list the rest/);
    expect(answerUserPrompt("Which function replaces matlab.addons.install?", [])).not.toContain("Answer shape");
  });
});
