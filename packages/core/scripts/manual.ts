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
    if (!r.receipts) return `| ${r.categoryId} | ${r.question} | error | – | – | – | – | ${r.error} |`;
    const x = r.receipts;
    const v = (k: string) => x.claims.filter((c) => c.verdict === k && c.repair !== "removed").length;
    const removed = x.claims.filter((c) => c.repair === "removed").length;
    const t = x.timingsMs;
    return (
      `| ${r.categoryId} | ${r.question} | ${x.outcome} | ${x.confidence} | ${x.sources.filter((s) => s.cited).length}/${x.sources.length} | ` +
      `${v("supported")}/${v("partial")}/${v("unsupported")}${removed ? ` (−${removed})` : ""} | ${secs(t.total)} | ` +
      `plan ${secs(t.plan)} · search ${secs(t.search)} · read ${secs(t.read)} · answer ${secs(t.answer)} · verify ${secs(t.verify)}${t.repair ? ` · repair ${secs(t.repair)}` : ""} |`
    );
  });

  const stepNames = ["plan", "search", "read", "answer", "verify", "repair"] as const;
  const md = [
    `# Phase 2 manual run`,
    ``,
    `Run on ${new Date(started).toISOString()} · ${jobs.length} questions (3 starters × ${jobs.length / 3} categories) · concurrency ${concurrency} · dev cache ${useCache ? "on" : "off"}.`,
    ``,
    `- Cited answers: **${citedAnswers.length}/${jobs.length}**`,
    `- Outcomes: ${Object.entries(ok.reduce<Record<string, number>>((m, r) => ((m[r.receipts!.outcome] = (m[r.receipts!.outcome] ?? 0) + 1), m), {})).map(([k, n]) => `${k} ${n}`).join(", ")}${results.length - ok.length ? `, errors ${results.length - ok.length}` : ""}`,
    `- Confidence: ${["high", "medium", "low"].map((c) => `${c} ${ok.filter((r) => r.receipts!.confidence === c).length}`).join(", ")}`,
    `- Total time: median **${secs(median(totals))}s**, slowest **${secs(slowest?.receipts?.timingsMs.total)}s** (${slowest?.categoryId}: "${slowest?.question}")`,
    ``,
    `| Step | median s | slowest s | runs |`,
    `|---|---|---|---|`,
    ...stepNames.map((s) => {
      const xs = step(s);
      return xs.length ? `| ${s} | ${secs(median(xs))} | ${secs(Math.max(...xs))} | ${xs.length} |` : `| ${s} | – | – | 0 |`;
    }),
    ``,
    `| Category | Question | Outcome | Confidence | Cited/sources | Claims S/P/U | Total s | Steps |`,
    `|---|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
  ].join("\n");

  const dir = join(projectRoot(), "evals", "manual");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "phase2-receipts.jsonl"), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
  await writeFile(join(dir, "phase2.md"), md);
  console.log(`\n${md.split("\n").slice(0, 18).join("\n")}\n\nwrote ${dir}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
