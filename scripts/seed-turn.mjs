/**
 * Seed a finished turn into the page's sessionStorage from a saved receipt, so finished-state UI
 * (answer, notes, verdicts, drawer) can be inspected without spending a live question.
 */
import { readFileSync } from "node:fs";

export function seededTurn(match = "COVID-19 vaccine", file = "evals/manual/phase2-followup-receipts.jsonl") {
  const r = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l).receipts).find((x) => x?.question.includes(match));
  if (!r) throw new Error(`no saved receipt matching "${match}"`);
  return {
    id: "seeded-1", question: r.question, categoryId: r.categoryId, resolvedCategory: r.categoryId, status: "done", phase: "finished",
    statusText: `Searched ${r.queries.length} queries · read ${r.sources.filter((s) => s.readStatus === "full").length} pages · ${(r.timingsMs.total / 1000).toFixed(1)}s`,
    queries: r.queries, sources: r.sources, answer: r.answer, claims: r.claims, receipts: r, notes: r.studyNotes, startedAt: Date.now(),
  };
}

export async function seedPage(page, base, turn) {
  await page.goto(`${base}/#${turn.categoryId}`);
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [`studyhall:turns:${turn.categoryId}`, JSON.stringify([turn])]);
  await page.reload();
  await page.locator(".answer").waitFor();
}
