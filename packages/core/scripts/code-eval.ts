/**
 * Code-check eval: run "Check my code" on evals/code-snippets.jsonl (12 snippets: 4 MATLAB, 4 Fusion
 * Python, 4 iLogic; half use a call the vendor's official docs mark deprecated or retired, half are
 * clean) and measure, on each snippet's labelled call:
 *   - flag rate on bad calls: marked deprecated or removed (and whether the documented replacement was named)
 *   - false-flag rate on clean calls: marked deprecated or removed
 *   - not found and unverifiable, reported separately
 * Other calls the parser finds are shown for context, not scored. Scoring fixed before any run.
 *   pnpm --filter core code-eval [--run code-YYYY-MM-DD] [--ids a,b] [--concurrency 3] [--publish]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { checkCodeToReceipts, claudeCost, loadEnv, noCache, VERSION, YOU_PRICE, YouClient, type CodeCheckReceipts } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(`--${n}`) ? (argv[argv.indexOf(`--${n}`) + 1] ?? "") : undefined);
const RUN = flag("run") ?? `code-${new Date().toISOString().slice(0, 10)}`;
/** Snippet file under evals/ and the name used when publishing (code -> evals/code-results.*). */
const SNIPPETS = flag("snippets") ?? "code-snippets.jsonl";
const OUT = flag("out") ?? "code";
const CONCURRENCY = Number(flag("concurrency") ?? 3);
const runDir = join(root, "evals", "runs", RUN);

const Snippet = z.object({
  id: z.string(),
  lang: z.enum(["matlab", "fusion", "ilogic"]),
  label: z.enum(["bad", "clean"]),
  call: z.string(),
  replacement: z.string().optional(),
  code: z.string(),
  source: z.string().url(),
  status_wording: z.string(),
  checked_on: z.string(),
  note: z.string().optional(),
});
type Snippet = z.infer<typeof Snippet>;

interface Raw {
  id: string;
  label: "bad" | "clean";
  call: string;
  status: string;
  replacement?: string;
  replacementOk?: boolean;
  latencyMs: number;
  youUsd: number;
  claudeUsd: number;
  receipts?: CodeCheckReceipts;
  error?: string;
}

async function runOne(s: Snippet): Promise<Raw> {
  const file = join(runDir, "raw", `${s.id}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Raw;
  const t0 = performance.now();
  let raw: Raw;
  try {
    const r = await checkCodeToReceipts(s.code, { lang: s.lang, you: new YouClient({ cache: noCache }) });
    const c = r.calls.find((x) => x.name === s.call);
    raw = {
      id: s.id,
      label: s.label,
      call: s.call,
      status: c?.status ?? "not_parsed",
      ...(c?.replacement ? { replacement: c.replacement } : {}),
      ...(s.replacement ? { replacementOk: Boolean(c?.replacement && c.replacement.toLowerCase().includes(s.replacement.toLowerCase())) } : {}),
      latencyMs: Math.round(performance.now() - t0),
      youUsd: r.usage.you.searches * YOU_PRICE.search + r.usage.you.contentsPages * YOU_PRICE.contentsPage,
      claudeUsd: claudeCost(r.usage.llm),
      receipts: r,
    };
  } catch (err) {
    raw = { id: s.id, label: s.label, call: s.call, status: "error", latencyMs: Math.round(performance.now() - t0), youUsd: 0, claudeUsd: 0, error: err instanceof Error ? err.message : String(err) };
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  return raw;
}

const FLAG = new Set(["deprecated", "removed"]);
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};

function summarize(snippets: Snippet[], raws: Raw[]) {
  const bad = raws.filter((r) => r.label === "bad");
  const clean = raws.filter((r) => r.label === "clean");
  const count = (rs: Raw[], f: (r: Raw) => boolean) => rs.filter(f).length;
  const others = raws.flatMap((r) => (r.receipts?.calls ?? []).filter((c) => c.name !== r.call).map((c) => c.status));
  return {
    run: RUN,
    core: VERSION,
    generatedAt: new Date().toISOString(),
    snippets: raws.length,
    badCalls: bad.length,
    cleanCalls: clean.length,
    flagRate: { n: count(bad, (r) => FLAG.has(r.status)), of: bad.length },
    replacementNamed: { n: count(bad, (r) => Boolean(r.replacementOk)), of: bad.length },
    falseFlagRate: { n: count(clean, (r) => FLAG.has(r.status)), of: clean.length },
    notFound: { bad: count(bad, (r) => r.status === "not_found"), clean: count(clean, (r) => r.status === "not_found") },
    unverifiable: { bad: count(bad, (r) => r.status === "unverifiable"), clean: count(clean, (r) => r.status === "unverifiable") },
    otherCalls: Object.fromEntries(["current", "deprecated", "removed", "not_found", "unverifiable"].map((s) => [s, others.filter((o) => o === s).length])),
    medianLatencyMs: median(raws.map((r) => r.latencyMs)),
    youUsd: raws.reduce((s, r) => s + r.youUsd, 0),
    claudeUsd: raws.reduce((s, r) => s + r.claudeUsd, 0),
    rows: snippets.map((s) => {
      const r = raws.find((x) => x.id === s.id)!;
      return { id: s.id, lang: s.lang, label: s.label, call: s.call, status: r.status, replacement: r.replacement ?? "", expectedReplacement: s.replacement ?? "", release: r.receipts?.release ?? "", error: r.error ?? "" };
    }),
  };
}

function markdown(s: ReturnType<typeof summarize>): string {
  return [
    `## ${OUT === "code" ? "Code-check eval: Check my code (separate eval)" : `Code-check eval, held-out set (${SNIPPETS})`}`,
    ``,
    `Run \`${s.run}\` · core ${s.core} · ${s.snippets} snippets (\`evals/code-snippets.jsonl\`): 4 MATLAB, 4 Fusion Python, 4 Inventor iLogic. ${s.badCalls} use a call that the vendor's official docs mark deprecated or retired; ${s.cleanCalls} use only documented, current calls. Each labelled call has its official source and check date. Scored on each snippet's labelled call; reported as-is, with no tuning. It checks API usage against the docs; it doesn't run the code. One snippet is about 17 points per group.`,
    ``,
    `| Measure | Result |`,
    `|---|---|`,
    `| **Flag rate on bad calls** (marked deprecated or removed) | **${pct(s.flagRate.n, s.flagRate.of)}** (${s.flagRate.n} of ${s.flagRate.of}) |`,
    `| Documented replacement named | ${s.replacementNamed.n} of ${s.replacementNamed.of} |`,
    `| **False-flag rate on clean calls** (marked deprecated or removed) | **${pct(s.falseFlagRate.n, s.falseFlagRate.of)}** (${s.falseFlagRate.n} of ${s.falseFlagRate.of}) |`,
    `| Not found in the docs searched | ${s.notFound.bad} bad, ${s.notFound.clean} clean |`,
    `| Unverifiable | ${s.unverifiable.bad} bad, ${s.unverifiable.clean} clean |`,
    ``,
    `Other (unlabelled) calls in the snippets: ${Object.entries(s.otherCalls).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(", ")}. Median ${(s.medianLatencyMs / 1000).toFixed(1)}s per check · You.com $${s.youUsd.toFixed(3)} and Claude $${s.claudeUsd.toFixed(3)} for all ${s.snippets}.`,
    ``,
    `| Snippet | Label | Call | Verdict | Replacement named (expected) |`,
    `|---|---|---|---|---|`,
    ...s.rows.map((r) => `| ${r.id} | ${r.label} | \`${r.call}\` | ${r.status} | ${r.replacement || "–"}${r.expectedReplacement ? ` (${r.expectedReplacement})` : ""} |`),
    ``,
  ].join("\n");
}

async function main() {
  loadEnv();
  const all = readFileSync(join(root, "evals", SNIPPETS), "utf8").trim().split("\n").map((l) => Snippet.parse(JSON.parse(l)));
  const ids = flag("ids")?.split(",");
  const snippets = ids ? all.filter((s) => ids.includes(s.id)) : all;
  const raws: Raw[] = new Array(snippets.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, snippets.length) }, async () => {
      while (next < snippets.length) {
        const i = next++;
        const r = await runOne(snippets[i]!);
        raws[i] = r;
        console.log(`[${i + 1}/${snippets.length}] ${r.id}: ${r.label} ${r.call} -> ${r.status}${r.replacement ? ` (${r.replacement})` : ""} ${(r.latencyMs / 1000).toFixed(1)}s You.com $${r.youUsd.toFixed(3)}${r.error ? ` ERROR ${r.error}` : ""}`);
      }
    }),
  );
  const s = summarize(snippets, raws);
  const md = markdown(s);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "results.json"), JSON.stringify(s, null, 2) + "\n");
  writeFileSync(join(runDir, "results.md"), md);
  console.log(`\n${md}`);
  if (argv.includes("--publish")) {
    writeFileSync(join(root, "evals", `${OUT}-results.json`), JSON.stringify(s, null, 2) + "\n");
    writeFileSync(join(root, "evals", `${OUT}-results.md`), `# Studyhall evals\n\n${md}`);
    const resultsMd = join(root, "evals", "results.md");
    const BEGIN = `<!-- ${OUT}-eval:begin -->`;
    const END = `<!-- ${OUT}-eval:end -->`;
    const current = readFileSync(resultsMd, "utf8");
    const block = `${BEGIN}\n${md}${END}\n`;
    writeFileSync(resultsMd, current.includes(BEGIN) ? current.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`), block) : `${current.trimEnd()}\n\n${block}`);
    console.log(`published evals/${OUT}-results.{json,md} and the ${OUT}-eval block in evals/results.md`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
