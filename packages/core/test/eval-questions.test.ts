import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getCategory } from "../src/categories/registry.js";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "evals", "questions.jsonl");
const Question = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  category: z.string(),
  app: z.string().optional(),
  question: z.string().min(10),
  expected: z.string().min(2),
  accept: z.array(z.string().min(1)).min(1),
  reject: z.array(z.string()).optional(),
  volatile: z.boolean(),
  sources: z.array(z.string().url()).min(1),
  checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string(),
});

describe("evals/questions.jsonl", () => {
  const rows = readFileSync(file, "utf8").trim().split("\n").map((l) => Question.parse(JSON.parse(l)));

  it("is valid, with unique ids, real categories and apps, and official sources", () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      const cat = getCategory(r.category);
      expect(cat, r.id).toBeDefined();
      if (r.app) expect(cat!.apps?.some((a) => a.id === r.app), r.id).toBe(true);
    }
  });

  it("has the 8 Engineering Software questions, each verified and cited", () => {
    const eng = rows.filter((r) => r.category === "engineering");
    expect(eng).toHaveLength(8);
    expect(eng.map((r) => r.app).sort()).toEqual(["fusion", "fusion", "inventor", "matlab", "matlab", "matlab", "onshape", "solidworks"]);
    const official = /autodesk\.com|mathworks\.com|solidworks\.com|onshape\.com/;
    for (const r of eng) expect(r.sources.some((s) => official.test(s)), r.id).toBe(true);
    expect(eng.find((r) => r.id === "eng-matlab-addons-install")!.accept).toContain("mpminstall");
  });
});
