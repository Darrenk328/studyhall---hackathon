import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getCategory } from "../src/categories/registry.js";
import { EvalQuestion, termMatch } from "../src/evals/grade.js";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "evals", "questions.jsonl");
const Question = EvalQuestion.extend({
  id: z.string().regex(/^[a-z0-9-]+$/),
  question: z.string().min(10),
  sources: z.array(z.string().url()).min(1),
  checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

  it("covers every category with about 5 questions, roughly 70/30 time-sensitive vs stable", () => {
    const cats = new Set(rows.map((r) => r.category));
    expect(cats.size).toBe(13);
    for (const c of cats) expect(rows.filter((r) => r.category === c).length, c).toBeGreaterThanOrEqual(4);
    const ts = rows.filter((r) => r.type === "time-sensitive").length / rows.length;
    expect(ts).toBeGreaterThan(0.6);
    expect(ts).toBeLessThan(0.8);
  });

  it("each expected answer passes its own term match", () => {
    for (const r of rows) expect(termMatch(r.expected, r).match, r.id).toBe(true);
  });
});
