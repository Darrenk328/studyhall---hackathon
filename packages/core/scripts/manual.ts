/**
 * Phase 2 manual check: run every category's 3 starter questions live and summarize.
 *   pnpm --filter core manual [--concurrency 3] [--only health,tech] [--cache]
 * Writes evals/manual/phase2-receipts.jsonl and evals/manual/phase2.md.
 * The dev cache is off by default so timings reflect live calls.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { answerToReceipts, CATEGORIES, cacheFromEnv, loadEnv, noCache, projectRoot, YouClient, type Receipts } from "../src/index.js";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const concurrency = Number(flag("concurrency") ?? 3);
const only = flag("only")?.split(",");
const useCache = argv.includes("--cache");
const name = flag("name") ?? "phase2";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};
const secs = (ms: number | undefined) => (ms === undefined ? "–" : (ms / 1000).toFixed(1));

async function main() {
  loadEnv();
  const you = new YouClient({ cache: useCache ? cacheFromEnv() : noCache });
  const jobs = CATEGORIES.filter((c) => !only || only.includes(c.id)).flatMap((c) => c.starters.map((q) => ({ categoryId: c.id, question: q })));
  const results: { categoryId: string; question: string; receipts?: Receipts; error?: string }[] = [];
  let next = 0;
  const started = Date.now();

  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      try {
        const receipts = await answerToReceipts(job.question, job.categoryId, { you });
        results.push({ ...job, receipts });
        const cited = receipts.sources.filter((s) => s.cited).length;
        console.log(
          `${receipts.outcome === "answered" && cited ? "✓" : "·"} ${job.categoryId.padEnd(9)} ${secs(receipts.timingsMs.total).padStart(5)}s ` +
            `${receipts.outcome.padEnd(20)} ${receipts.confidence.padEnd(6)} cited=${cited} ${job.question}`,
        );
      } catch (err) {
        results.push({ ...job, error: err instanceof Error ? err.message : String(err) });
        console.log(`✗ ${job.categoryId.padEnd(9)} ERROR ${job.question}: ${String(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const order = new Map(jobs.map((j, i) => [j.question, i]));
  results.sort((a, b) => order.get(a.question)! - order.get(b.question)!);
  const ok = results.filter((r) => r.receipts);
  const totals = ok.map((r) => r.receipts!.timingsMs.total);
  const step = (name: keyof Receipts["timingsMs"]) => ok.map((r) => r.receipts!.timingsMs[name]).filter((v): v is number => typeof v === "number");
  const slowest = ok.reduce((a, b) => (b.receipts!.timingsMs.total > a.receipts!.timingsMs.total ? b : a), ok[0]!);
  const citedAnswers = ok.filter((r) => r.receipts!.outcome === "answered" && r.receipts!.sources.some((s) => s.cited));

  const rows = results.map((r) => {
    if (!r.receipts) return `| ${r.categoryId} | ${r.question} | error | – | – | – | – | – | ${r.error} |`;
    const x = r.receipts;
    const v = (k: string) => x.claims.filter((c) => c.verdict === k).length;
    const rewritten = x.claims.filter((c) => c.repair === "rewritten").length;
    const t = x.timingsMs;
    const why = x.confidence === "high" ? "" : x.confidenceReasons.join(" ");
    return (
      `| ${r.categoryId} | ${r.question} | ${x.outcome} | ${x.confidence} | ${why} | ${x.sources.filter((s) => s.cited).length}/${x.sources.length} | ` +
      `${v("supported")}/${v("partial")}/${v("unsupported")}/${v("meta")}${rewritten ? ` (↻${rewritten})` : ""}${x.removedClaims.length ? ` (−${x.removedClaims.length})` : ""} | ${secs(t.total)} | ` +
      `plan ${secs(t.plan)} · search ${secs(t.search)} · read ${secs(t.read)} · notes ${secs(t.notes)} · answer ${secs(t.answer)} · verify ${secs(t.verify)}` +
      `${t.repair ? ` · repair ${secs(t.repair)}` : ""}${t.reverify ? ` · reverify ${secs(t.reverify)}` : ""} |`
    );
  });

  // Repair accounting: answers whose first verify found an unsupported claim, and how they ended.
  const repairedRuns = ok.filter((r) => r.receipts!.timingsMs.repair !== undefined);
  const stillUnsupported = repairedRuns.filter((r) => r.receipts!.claims.some((c) => c.verdict === "unsupported"));
  const allClaims = ok.flatMap((r) => r.receipts!.claims);
  const unlocated = allClaims.filter((c) => !c.span).length;

  const stepNames = ["plan", "search", "read", "notes", "answer", "verify", "repair", "reverify"] as const;
  const md = [
    `# ${name} manual run`,
    ``,
    `Run on ${new Date(started).toISOString()} · ${jobs.length} questions (3 starters × ${jobs.length / 3} categories) · concurrency ${concurrency} · dev cache ${useCache ? "on" : "off"}.`,
    ``,
    `- Cited answers: **${citedAnswers.length}/${jobs.length}**`,
    `- Outcomes: ${Object.entries(ok.reduce<Record<string, number>>((m, r) => ((m[r.receipts!.outcome] = (m[r.receipts!.outcome] ?? 0) + 1), m), {})).map(([k, n]) => `${k} ${n}`).join(", ")}${results.length - ok.length ? `, errors ${results.length - ok.length}` : ""}`,
    `- Confidence: ${["high", "medium", "low"].map((c) => `${c} ${ok.filter((r) => r.receipts!.confidence === c).length}`).join(", ")}`,
    `- Total time: median **${secs(median(totals))}s**, mean ${secs(totals.reduce((a, b) => a + b, 0) / totals.length)}s, slowest **${secs(slowest?.receipts?.timingsMs.total)}s** (${slowest?.categoryId}: "${slowest?.question}"); over 20s: ${totals.filter((t) => t > 20_000).length}`,
    `- Repair: ${repairedRuns.length} answers had an unsupported claim; after one repair + re-verify, ${repairedRuns.length - stillUnsupported.length} have none left, ${stillUnsupported.length} still do. Claims removed by repair: ${ok.reduce((n, r) => n + r.receipts!.removedClaims.length, 0)}.`,
    `- Claims (final text): ${["supported", "partial", "unsupported", "meta"].map((k) => `${k} ${allClaims.filter((c) => c.verdict === k).length}`).join(", ")}; rewritten and re-verified ${allClaims.filter((c) => c.repair === "rewritten").length}; not located in the answer ${unlocated}.`,
    `- Study notes present: ${ok.filter((r) => r.receipts!.studyNotes).length}/${ok.length}`,
    ``,
    `| Step | mean s | median s | slowest s | runs |`,
    `|---|---|---|---|---|`,
    ...stepNames.map((s) => {
      const xs = step(s);
      return xs.length ? `| ${s} | ${secs(xs.reduce((a, b) => a + b, 0) / xs.length)} | ${secs(median(xs))} | ${secs(Math.max(...xs))} | ${xs.length} |` : `| ${s} | – | – | – | 0 |`;
    }),
    ``,
    `| Category | Question | Outcome | Confidence | Why not high | Cited/sources | Claims S/P/U/M | Total s | Steps |`,
    `|---|---|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
  ].join("\n");

  const dir = join(projectRoot(), "evals", "manual");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}-receipts.jsonl`), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
  await writeFile(join(dir, `${name}.md`), md);
  console.log(`\n${md.split("\n").slice(0, 22).join("\n")}\n\nwrote ${dir}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
