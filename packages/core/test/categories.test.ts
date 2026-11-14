import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTO_ID, CATEGORIES, getCategory } from "../src/categories/registry.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "categories");

describe("category registry", () => {
  it("ships the 13 categories with unique ids", () => {
    expect(CATEGORIES.map((c) => c.id).sort()).toEqual(
      ["business", "creative", "engineering", "finance", "food", "gaming", "health", "learning", "legal", "science", "sports", "tech", "travel"],
    );
  });

  it("Engineering Software is version-aware with its apps, authorities and blocked lookalikes", () => {
    const e = getCategory("engineering")!;
    expect(e).toMatchObject({ name: "Engineering Software", icon: "wrench", freshness: "month", minSources: 1, versionAware: true });
    expect(e.apps!.map((a) => a.label)).toEqual(["Fusion", "Inventor", "SolidWorks", "Onshape", "Creo", "FreeCAD", "MATLAB", "Simulink"]);
    expect(e.blockedDomains).toEqual(expect.arrayContaining(["doc.photonengine.com", "fusionsignage.com.au"]));
    expect(e.authorityDomains).toEqual(["help.autodesk.com", "autodesk.com", "help.solidworks.com", "onshape.com", "ptc.com", "freecad.org", "mathworks.com"]);
    expect(e.starters).toEqual([
      "What changed in the latest Autodesk Fusion update?",
      "How do I make a sheet metal flange in Inventor?",
      "What's new in the latest MATLAB release?",
    ]);
  });

  it("registers every category file", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !["types.ts", "registry.ts"].includes(f));
    expect(files.map((f) => f.replace(/\.ts$/, "")).sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
  });

  it.each(CATEGORIES.map((c) => [c.id, c] as const))("%s is complete", (_id, c) => {
    expect(c.preferredDomains.length).toBeGreaterThanOrEqual(5);
    expect(c.preferredDomains.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))).toBe(true);
    expect(c.blockedDomains.length).toBeGreaterThan(0);
    expect(c.preferredDomains.some((d) => c.blockedDomains.includes(d))).toBe(false);
    expect(c.authorityDomains.length).toBeGreaterThan(0);
    expect(c.authorityDomains.filter((d) => !c.preferredDomains.includes(d))).toEqual([]);
    expect(c.starters).toHaveLength(3);
    expect(c.queryHints.length).toBeGreaterThan(0);
    expect(c.minSources).toBeGreaterThanOrEqual(1);
    expect(c.persona.length).toBeGreaterThan(20);
  });

  it("health, finance and legal have safety text, a professional and minSources >= 2", () => {
    for (const id of ["health", "finance", "legal"]) {
      const c = getCategory(id)!;
      expect(c.safety).toBeTruthy();
      expect(c.professional).toBeTruthy();
      expect(c.minSources).toBeGreaterThanOrEqual(2);
    }
  });

  it("health prefers the plan's agencies", () => {
    expect(getCategory("health")!.preferredDomains).toEqual(expect.arrayContaining(["who.int", "cdc.gov", "nih.gov", "nhs.uk", "mayoclinic.org"]));
    expect(getCategory("finance")!.preferredDomains).toEqual(expect.arrayContaining(["sec.gov", "federalreserve.gov", "investopedia.com"]));
  });

  it("authority lists hold official sources, not aggregators or blogs", () => {
    expect(getCategory("learning")!.authorityDomains).not.toContain("coursera.org");
    expect(getCategory("health")!.authorityDomains).toEqual(expect.arrayContaining(["cdc.gov", "who.int", "nih.gov"]));
    expect(getCategory("business")!.authorityDomains).not.toContain("cnbc.com");
  });

  it("lookup is case-insensitive and auto is not a real category", () => {
    expect(getCategory("Health")?.id).toBe("health");
    expect(getCategory(AUTO_ID)).toBeUndefined();
  });
});
