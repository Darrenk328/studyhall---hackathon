/**
 * pnpm ask <category|auto> "<question>" [--json]
 * Streams progress to stderr and the answer to stdout, then prints the receipts.
 */
import { AUTO_ID, answer, categoryIds, loadEnv, type Receipts } from "../src/index.js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const json = args.includes("--json");
const positional = args.filter((a) => !a.startsWith("--"));
const ids = [AUTO_ID, ...categoryIds()];

let [categoryId, ...rest] = positional;
if (categoryId && !ids.includes(categoryId.toLowerCase())) {
  rest = [categoryId, ...rest];
  categoryId = AUTO_ID;
}
const question = rest.join(" ").trim();
if (!question) {
  console.error(`Usage: pnpm ask <${ids.join("|")}> "your question" [--json]`);
  process.exit(2);
}

const VERDICT = { supported: "✓", partial: "~", unsupported: "✗", meta: "·" } as const;
const err = (s: string) => process.stderr.write(s);

function printReceipts(r: Receipts, streamed: string) {
  if (r.answer !== streamed) console.log(`\n\n--- final answer ---\n${r.answer}`);
  console.log("\n\nSources");
  for (const s of r.sources) {
    const date = s.published?.slice(0, 10) ?? "no date";
    console.log(`  [${s.id}] ${s.cited ? "cited" : "     "} ${s.readStatus.padEnd(8)} ${date}  ${s.domain}  ${s.title.slice(0, 70)}`);
  }
  if (r.studyNotes) {
    const n = r.studyNotes;
    const items = (label: string, xs: { text: string; sourceIds: number[] }[]) =>
      xs.length ? `\n  ${label}:\n${xs.map((x) => `    - ${x.text} [${x.sourceIds.join(",")}]`).join("\n")}` : "";
    console.log(`\nStudy notes\n  Focus: ${n.focus}${items("Key points", n.keyPoints)}${items("Conflicts", n.conflicts)}${items("May be stale", n.mayBeStale)}`);
  }
  if (r.claims.length) {
    console.log("\nClaims");
    for (const c of r.claims) {
      const tag = c.repair ? ` (${c.repair})` : "";
      const where = c.span ? "" : " (not located)";
      console.log(`  ${VERDICT[c.verdict]} ${c.verdict}${tag}${where} [${c.sourceIds.join(",")}] ${c.text.slice(0, 110)}`);
    }
  }
  for (const c of r.removedClaims) console.log(`  ✂ removed by repair: ${c.text.slice(0, 110)}`);
  console.log(
    `\nConfidence: ${r.confidence.toUpperCase()} (${r.confidenceReasons.join(" ")})` +
      `\nAs of ${r.asOf}${r.newestSourceAge ? ` · newest source ${r.newestSourceAge}` : ""}` +
      `\nOutcome: ${r.outcome} · category: ${r.categoryId}${r.categoryAuto ? " (auto)" : ""}` +
      `\nModels: ${Object.entries(r.models).map(([k, v]) => `${k}=${v}`).join(", ")}` +
      `\nTimings (ms): ${Object.entries(r.timingsMs).map(([k, v]) => `${k}=${v}`).join(", ")}`,
  );
  if (r.removedCitations.length) console.log(`Removed citations: ${r.removedCitations.join(", ")}`);
  for (const w of r.warnings) console.log(`Warning: ${w}`);
}

async function main() {
  loadEnv();
  let streamed = "";
  for await (const ev of answer(question, categoryId ?? AUTO_ID)) {
    if (json) {
      if (ev.type === "done") console.log(JSON.stringify(ev.receipts, null, 2));
      continue;
    }
    switch (ev.type) {
      case "category":
        err(`category: ${ev.categoryId}${ev.auto ? " (auto)" : ""}\n`);
        break;
      case "queries":
        err(`queries: ${ev.queries.map((q) => `"${q}"`).join(", ")}\n`);
        break;
      case "searching":
        err(`Searching ${ev.count} queries…\n`);
        break;
      case "sources":
        err(`Found ${ev.sources.length} sources.\n`);
        break;
      case "reading":
        err(`Reading ${ev.count} sources…\n\n`);
        break;
      case "answer_delta":
        streamed += ev.text;
        process.stdout.write(ev.text);
        break;
      case "answer_replaced":
        err(`\n[answer ${ev.reason}]\n`);
        if (ev.reason === "refused") {
          streamed = ev.text;
          console.log(ev.text);
        }
        break;
      case "verifying":
        err(`\n\nChecking claims…\n`);
        break;
      case "notes":
        err(`[study notes ready: ${ev.notes.keyPoints.length} key points, ${ev.notes.conflicts.length} conflicts]\n`);
        break;
      case "verdicts":
        err(`Checked ${ev.claims.length} claims.\n`);
        break;
      case "error":
        err(`\nerror in ${ev.step}: ${ev.message}\n`);
        break;
      case "done":
        printReceipts(ev.receipts, streamed);
        break;
    }
  }
}

main().catch((e: unknown) => {
  console.error(`\nask FAILED: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  process.exit(1);
});
