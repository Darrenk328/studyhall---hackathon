/**
 * Receipts eval: run "Check a claim" on evals/claims.jsonl (10 false claims the bare model really
 * made in the Nov 13 eval, 10 true claims from verified expected answers) and measure:
 *   - hallucination catch rate: false claims marked contradicted
 *   - false alarm rate: true claims marked contradicted
 *   - unverifiable rate
 *   pnpm --filter core claims-eval [--run claims-YYYY-MM-DD] [--ids a,b] [--concurrency 3] [--publish]
 * Raw receipts: evals/runs/<run>/raw/<id>.json (resumable). Summary: evals/runs/<run>/results.{json,md}.
 * --publish also writes evals/claims-results.{json,md} and the "Receipts eval" block in evals/results.md.
 *
 * Scoring rule (fixed before any run): each line is checked as one text. Its verdict is
 * "contradicted" if any extracted claim is contradicted, "supported" if every extracted claim is
 * supported, otherwise "unverifiable" (including when no claim was extracted).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { checkToReceipts, claudeCost, loadEnv, noCache, VERSION, YOU_PRICE, YouClient, type CheckReceipts, type ClaimVerdict } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(`--${n}`) ? (argv[argv.indexOf(`--${n}`) + 1] ?? "") : undefined);
const RUN = flag("run") ?? `claims-${new Date().toISOString().slice(0, 10)}`;
const CONCURRENCY = Number(flag("concurrency") ?? 3);
const runDir = join(root, "evals", "runs", RUN);

const ClaimRow = z.object({
  id: z.string(),
  label: z.enum(["true", "false"]),
  claim: z.string(),
  origin: z.record(z.string(), z.string()),
  truth: z.string(),
  source: z.string().url(),
  checked_on: z.string(),
});
type ClaimRow = z.infer<typeof ClaimRow>;

interface Raw {
  id: string;
  label: "true" | "false";
  claim: string;
  verdict: ClaimVerdict;
  latencyMs: number;
  youUsd: number;
  claudeUsd: number;
  checkedAt: string;
  receipts?: CheckReceipts;
  error?: string;
}

/** The scoring rule above. */
export function lineVerdict(r: Pick<CheckReceipts, "claims">): ClaimVerdict {
  if (!r.claims.length) return "unverifiable";
  if (r.claims.some((c) => c.verdict === "contradicted")) return "contradicted";
  if (r.claims.every((c) => c.verdict === "supported")) return "supported";
  return "unverifiable";
}

async function checkOne(row: ClaimRow): Promise<Raw> {
  const file = join(runDir, "raw", `${row.id}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Raw;
  const t0 = performance.now();
  let raw: Raw;
  try {
    const receipts = await checkToReceipts(row.claim, { you: new YouClient({ cache: noCache }) });
    const u = receipts.usage;
    raw = {
      id: row.id,
      label: row.label,
      claim: row.claim,
      verdict: lineVerdict(receipts),
      latencyMs: Math.round(performance.now() - t0),
      youUsd: u.you.searches * YOU_PRICE.search + u.you.contentsPages * YOU_PRICE.contentsPage,
      claudeUsd: claudeCost(u.llm),
      checkedAt: new Date().toISOString(),
      receipts,
    };
  } catch (err) {
    raw = { id: row.id, label: row.label, claim: row.claim, verdict: "unverifiable", latencyMs: Math.round(performance.now() - t0), youUsd: 0, claudeUsd: 0, checkedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) };
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  return raw;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};

function summarize(rows: ClaimRow[], raws: Raw[]) {
  const by = (label: "true" | "false", v: ClaimVerdict) => raws.filter((r) => r.label === label && r.verdict === v).length;
  const nFalse = raws.filter((r) => r.label === "false").length;
  const nTrue = raws.filter((r) => r.label === "true").length;
  const unver = raws.filter((r) => r.verdict === "unverifiable").length;
  return {
    run: RUN,
    core: VERSION,
    generatedAt: new Date().toISOString(),
    claims: raws.length,
    falseClaims: nFalse,
    trueClaims: nTrue,
    catchRate: { n: by("false", "contradicted"), of: nFalse },
    falseAlarmRate: { n: by("true", "contradicted"), of: nTrue },
    unverifiableRate: { n: unver, of: raws.length },
    falseMarkedSupported: { n: by("false", "supported"), of: nFalse },
    trueConfirmed: { n: by("true", "supported"), of: nTrue },
    matrix: {
      false: { contradicted: by("false", "contradicted"), unverifiable: by("false", "unverifiable"), supported: by("false", "supported") },
      true: { contradicted: by("true", "contradicted"), unverifiable: by("true", "unverifiable"), supported: by("true", "supported") },
    },
    errors: raws.filter((r) => r.error).map((r) => ({ id: r.id, error: r.error })),
    medianLatencyMs: median(raws.map((r) => r.latencyMs)),
    youUsd: raws.reduce((s, r) => s + r.youUsd, 0),
    claudeUsd: raws.reduce((s, r) => s + r.claudeUsd, 0),
    rows: rows.map((row) => {
      const r = raws.find((x) => x.id === row.id)!;
      return { id: row.id, label: row.label, claim: row.claim, verdict: r.verdict, extracted: r.receipts?.claims.length ?? 0, note: r.receipts?.claims.map((c) => c.note).join(" | ") ?? r.error ?? "" };
    }),
  };
}

function markdown(s: ReturnType<typeof summarize>): string {
  const m = s.matrix;
  return [
    `## Receipts eval: Check a claim (separate eval)`,
    ``,
    `Run \`${s.run}\` · core ${s.core} · ${s.claims} claims: ${s.falseClaims} false claims the bare model really made in the Nov 13 eval, and ${s.trueClaims} true claims from that eval's verified answers (\`evals/claims.jsonl\`, each with a source and check date). Each claim was pasted into "Check a claim" on its own. Reported as-is, with no tuning after seeing results. This is a different measurement from the 65-question answer eval above, and a small one: one claim is 10 points.`,
    ``,
    `| Measure | Result |`,
    `|---|---|`,
    `| **Hallucination catch rate** (false claims marked contradicted) | **${pct(s.catchRate.n, s.catchRate.of)}** (${s.catchRate.n} of ${s.catchRate.of}) |`,
    `| **False alarm rate** (true claims marked contradicted) | **${pct(s.falseAlarmRate.n, s.falseAlarmRate.of)}** (${s.falseAlarmRate.n} of ${s.falseAlarmRate.of}) |`,
    `| Unverifiable (all claims) | ${pct(s.unverifiableRate.n, s.unverifiableRate.of)} (${s.unverifiableRate.n} of ${s.unverifiableRate.of}) |`,
    `| False claims marked supported | ${s.falseMarkedSupported.n} of ${s.falseMarkedSupported.of} |`,
    `| True claims confirmed (supported) | ${s.trueConfirmed.n} of ${s.trueConfirmed.of} |`,
    ``,
    `| Label → verdict | Contradicted | Unverifiable | Supported |`,
    `|---|---|---|---|`,
    `| False claims | ${m.false.contradicted} | ${m.false.unverifiable} | ${m.false.supported} |`,
    `| True claims | ${m.true.contradicted} | ${m.true.unverifiable} | ${m.true.supported} |`,
    ``,
    `Median ${(s.medianLatencyMs / 1000).toFixed(1)}s per check · You.com $${s.youUsd.toFixed(3)} and Claude $${s.claudeUsd.toFixed(3)} for all ${s.claims} checks.${s.errors.length ? ` Errors: ${s.errors.map((e) => e.id).join(", ")}.` : ""}`,
    ``,
    `| Claim | Label | Verdict |`,
    `|---|---|---|`,
    ...s.rows.map((r) => `| ${r.claim.replace(/\|/g, "\\|")} | ${r.label} | ${r.verdict} |`),
    ``,
  ].join("\n");
}

async function main() {
  loadEnv();
  const all = readFileSync(join(root, "evals", "claims.jsonl"), "utf8").trim().split("\n").map((l) => ClaimRow.parse(JSON.parse(l)));
  const ids = flag("ids")?.split(",");
  const rows = ids ? all.filter((r) => ids.includes(r.id)) : all;
  const raws: Raw[] = new Array(rows.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const i = next++;
        const r = await checkOne(rows[i]!);
        raws[i] = r;
        console.log(`[${i + 1}/${rows.length}] ${r.id}: ${r.label} -> ${r.verdict} ${(r.latencyMs / 1000).toFixed(1)}s You.com $${r.youUsd.toFixed(3)}${r.error ? ` ERROR ${r.error}` : ""}`);
      }
    }),
  );
  const s = summarize(rows, raws);
  const md = markdown(s);
  writeFileSync(join(runDir, "results.json"), JSON.stringify(s, null, 2) + "\n");
  writeFileSync(join(runDir, "results.md"), md);
  console.log(`\n${md}`);
  if (argv.includes("--publish")) {
    writeFileSync(join(root, "evals", "claims-results.json"), JSON.stringify(s, null, 2) + "\n");
    writeFileSync(join(root, "evals", "claims-results.md"), `# Studyhall evals\n\n${md}`);
    const resultsMd = join(root, "evals", "results.md");
    const BEGIN = "<!-- receipts-eval:begin -->";
    const END = "<!-- receipts-eval:end -->";
    const current = readFileSync(resultsMd, "utf8");
    const block = `${BEGIN}\n${md}${END}\n`;
    const updated = current.includes(BEGIN) ? current.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`), block) : `${current.trimEnd()}\n\n${block}`;
    writeFileSync(resultsMd, updated);
    console.log("published evals/claims-results.{json,md} and the Receipts eval block in evals/results.md");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
