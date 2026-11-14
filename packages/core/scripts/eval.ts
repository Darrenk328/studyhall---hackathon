/**
 * Phase 6 evals: bare model (A) vs Studyhall (B) vs You.com Research API (C), same day.
 *   pnpm eval [--limit N] [--ids a,b] [--systems A,B,C] [--concurrency 3] [--run <name>] [--grade-only] [--publish]
 * Raw answers and receipts: evals/runs/<run>/raw/<system>/<id>.json (resumable: existing files are reused).
 * Graded rows: evals/runs/<run>/graded.jsonl. Summary: evals/runs/<run>/results.{json,md}.
 * --publish also writes evals/results.{json,md}, evals/spotcheck.md and docs/demo-questions.md.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  answerToReceipts,
  claudeCost,
  ClaudeClient,
  fetchJson,
  getCategory,
  loadEnv,
  memoryAnswer,
  noCache,
  requireEnv,
  YOU_PRICE,
  YouClient,
  type Receipts,
} from "../src/index.js";
import { citedIds } from "../src/pipeline/text.js";
import { median, summarize, SYSTEM_NAMES, type GradedRow, type SystemId } from "../src/evals/aggregate.js";
import { EvalQuestion, judge, termMatch } from "../src/evals/grade.js";
import { spotcheckAgreement } from "../src/evals/spotcheck.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(`--${n}`) ? (argv[argv.indexOf(`--${n}`) + 1] ?? "") : undefined);
const has = (n: string) => argv.includes(`--${n}`);

const RUN = flag("run") ?? new Date().toISOString().slice(0, 10);
const SYSTEMS = (flag("systems") ?? "A,B,C").split(",") as SystemId[];
const CONCURRENCY = Number(flag("concurrency") ?? 3);
const RESEARCH_EFFORT = flag("research-effort") ?? "standard";
const runDir = join(root, "evals", "runs", RUN);

interface RawAnswer {
  id: string;
  system: SystemId;
  question: string;
  answer: string;
  latencyMs: number;
  costUsd: number;
  model?: string;
  receipts?: Receipts;
  research?: { content: string; sources: { url: string; title?: string }[]; warnings: string[] };
  error?: string;
  answeredAt: string;
}

function loadQuestions(): EvalQuestion[] {
  const all = readFileSync(join(root, "evals", "questions.jsonl"), "utf8").trim().split("\n").map((l) => EvalQuestion.parse(JSON.parse(l)));
  const ids = flag("ids")?.split(",");
  const filtered = ids ? all.filter((q) => ids.includes(q.id)) : all;
  const limit = flag("limit");
  return limit ? filtered.slice(0, Number(limit)) : filtered;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

// ---------------------------------------------------------------- systems

const claude = new ClaudeClient();

async function runA(q: EvalQuestion): Promise<Omit<RawAnswer, "answeredAt">> {
  const t = performance.now();
  const gen = memoryAnswer(claude, q.question, getCategory(q.category)!, new Date());
  let step = await gen.next();
  while (!step.done) step = await gen.next();
  const r = step.value;
  return { id: q.id, system: "A", question: q.question, answer: r.text, latencyMs: Math.round(performance.now() - t), costUsd: claudeCost([{ model: r.model, ...r.usage }]), model: r.model };
}

async function runB(q: EvalQuestion): Promise<Omit<RawAnswer, "answeredAt">> {
  const t = performance.now();
  const receipts = await answerToReceipts(q.question, q.category, { you: new YouClient({ cache: noCache }), now: () => new Date() });
  const usage = receipts.usage!;
  const cost = claudeCost(usage.llm) + usage.you.searches * YOU_PRICE.search + usage.you.contentsPages * YOU_PRICE.contentsPage;
  return { id: q.id, system: "B", question: q.question, answer: receipts.answer, latencyMs: Math.round(performance.now() - t), costUsd: cost, model: receipts.models.answer ?? "", receipts };
}

async function runC(q: EvalQuestion): Promise<Omit<RawAnswer, "answeredAt">> {
  const t = performance.now();
  const res = (await fetchJson({
    url: "https://api.you.com/v1/research",
    headers: { "X-API-Key": requireEnv("YDC_API_KEY") },
    body: { input: q.question, research_effort: RESEARCH_EFFORT },
    timeoutMs: 150_000,
  })) as { output?: { content?: unknown; sources?: { url: string; title?: string }[] }; warnings?: string[] };
  const content = typeof res.output?.content === "string" ? res.output.content : JSON.stringify(res.output?.content ?? "");
  return {
    id: q.id,
    system: "C",
    question: q.question,
    answer: content,
    latencyMs: Math.round(performance.now() - t),
    costUsd: YOU_PRICE.research[RESEARCH_EFFORT] ?? YOU_PRICE.research.standard!,
    research: { content, sources: (res.output?.sources ?? []).map((s) => ({ url: s.url, ...(s.title ? { title: s.title } : {}) })), warnings: res.warnings ?? [] },
  };
}

const RUNNERS: Record<SystemId, (q: EvalQuestion) => Promise<Omit<RawAnswer, "answeredAt">>> = { A: runA, B: runB, C: runC };

// ---------------------------------------------------------------- phases

async function answerAll(questions: EvalQuestion[]) {
  const tasks = questions.flatMap((q) => SYSTEMS.map((s) => ({ q, s })));
  let done = 0;
  await pool(tasks, CONCURRENCY, async ({ q, s }) => {
    const file = join(runDir, "raw", s, `${q.id}.json`);
    if (existsSync(file)) {
      done++;
      return;
    }
    mkdirSync(dirname(file), { recursive: true });
    let raw: RawAnswer;
    try {
      raw = { ...(await RUNNERS[s](q)), answeredAt: new Date().toISOString() };
    } catch (err) {
      raw = { id: q.id, system: s, question: q.question, answer: "", latencyMs: 0, costUsd: 0, error: err instanceof Error ? err.message : String(err), answeredAt: new Date().toISOString() };
    }
    writeFileSync(file, JSON.stringify(raw, null, 2));
    done++;
    console.log(`[${done}/${tasks.length}] ${s} ${q.id} ${raw.error ? `ERROR ${raw.error.slice(0, 80)}` : `${(raw.latencyMs / 1000).toFixed(1)}s $${raw.costUsd.toFixed(4)}`}`);
  });
}

async function gradeAll(questions: EvalQuestion[]): Promise<{ rows: GradedRow[]; judgeCost: number; details: Record<string, { reason: string; answer: string; found: string[] }> }> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const raws: RawAnswer[] = [];
  for (const s of SYSTEMS) {
    const dir = join(runDir, "raw", s);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const r = JSON.parse(readFileSync(join(dir, f), "utf8")) as RawAnswer;
      if (byId.has(r.id)) raws.push(r);
    }
  }
  const rows: GradedRow[] = [];
  const details: Record<string, { reason: string; answer: string; found: string[] }> = {};
  let judgeCost = 0;
  await pool(raws, 4, async (r) => {
    const q = byId.get(r.id)!;
    const tm = termMatch(r.answer, q);
    let verdict: GradedRow["verdict"] = "declined";
    let reason = r.error ? `System error: ${r.error}` : "";
    if (!r.error && r.answer.trim()) {
      const j = await judge(claude, q, r.answer);
      verdict = j.verdict;
      reason = j.reason;
      judgeCost += claudeCost([{ model: j.model, ...j.usage }]);
    } else if (!r.error) reason = "Empty answer.";
    const rc = r.receipts;
    rows.push({
      id: r.id,
      category: q.category,
      type: q.type,
      system: r.system,
      verdict,
      termMatch: tm.match,
      latencyMs: r.latencyMs,
      costUsd: r.costUsd,
      ...(rc
        ? {
            studyhall: {
              confidence: rc.confidence,
              outcome: rc.outcome,
              citations: citedIds(rc.answer).length,
              removedCitations: rc.removedCitations.length,
              gradedClaims: rc.claims.filter((c) => c.verdict !== "meta").length,
              unsupportedClaims: rc.claims.filter((c) => c.verdict === "unsupported").length,
            },
          }
        : {}),
      ...(r.error ? { error: r.error } : {}),
    });
    details[`${r.system}:${r.id}`] = { reason, answer: r.answer, found: tm.found };
  });
  rows.sort((a, b) => a.id.localeCompare(b.id) || a.system.localeCompare(b.system));
  writeFileSync(join(runDir, "graded.jsonl"), rows.map((r) => JSON.stringify({ ...r, judgeReason: details[`${r.system}:${r.id}`]!.reason })).join("\n") + "\n");
  return { rows, judgeCost, details };
}

// ---------------------------------------------------------------- reports

const pct = (x: number) => `${Math.round(x * 100)}%`;

function resultsMarkdown(questions: EvalQuestion[], s: ReturnType<typeof summarize>, judgeCost: number, spotLine?: string): string {
  const ts = questions.filter((q) => q.type === "time-sensitive").length;
  const lines = [
    `# Studyhall evals`,
    ``,
    `Run ${RUN} · ${questions.length} questions (${ts} time-sensitive, ${questions.length - ts} stable) · each system answered every question the same day · graded by term match plus a blind Sonnet judge (the judge saw one anonymized answer at a time). Declines are reported separately and never count as correct.`,
    ...(spotLine ? [``, spotLine] : []),
    ``,
    `## Overall`,
    ``,
    `| System | Correct | Partial | Wrong | Declined | Accuracy when it answered | Median latency | Cost per question |`,
    `|---|---|---|---|---|---|---|---|`,
    ...s.systems.map((x) => `| ${x.name} | **${pct(x.accuracy)}** | ${pct(x.partial)} | ${pct(x.wrong)} | ${pct(x.declined)} | ${pct(x.accuracyWhenAnswered)} | ${(x.medianLatencyMs / 1000).toFixed(1)}s | $${x.costPerQuestionUsd.toFixed(3)} |`),
    ``,
    `## The pitch numbers`,
    ``,
    `- When the bare model answered a time-sensitive question from memory (didn't decline), it was **wrong ${pct(s.pitch.bareTimeSensitive.wrongRate)}** of the time (${s.pitch.bareTimeSensitive.wrong} of ${s.pitch.bareTimeSensitive.answered}); wrong or only partly right ${pct(s.pitch.bareTimeSensitive.wrongOrPartialRate)} (${s.pitch.bareTimeSensitive.wrongOrPartial} of ${s.pitch.bareTimeSensitive.answered}).`,
    `- On the ${s.pitch.afterBareMiss.n} questions the bare model got wrong or declined, Studyhall was **correct ${pct(s.pitch.afterBareMiss.studyhallRate)}** (${s.pitch.afterBareMiss.studyhallCorrect} of ${s.pitch.afterBareMiss.n}). The You.com Research API was correct on ${s.pitch.afterBareMiss.researchCorrect} of the same ${s.pitch.afterBareMiss.n} (${pct(s.pitch.afterBareMiss.researchRate)}).`,
    ``,
    `## Time-sensitive vs stable (correct)`,
    ``,
    `| System | Time-sensitive | Stable |`,
    `|---|---|---|`,
    ...s.systems.map((x) => `| ${x.name} | ${pct(x.timeSensitive.accuracy)} (n=${x.timeSensitive.n}) | ${pct(x.stable.accuracy)} (n=${x.stable.n}) |`),
    ``,
    `## By category (correct)`,
    ``,
    `| Category | ${s.systems.map((x) => x.name).join(" | ")} |`,
    `|---|${s.systems.map(() => "---").join("|")}|`,
    ...[...new Set(questions.map((q) => q.category))].sort().map((c) => `| ${c} | ${s.systems.map((x) => (x.byCategory[c] ? `${pct(x.byCategory[c]!.accuracy)} (n=${x.byCategory[c]!.n})` : "–")).join(" | ")} |`),
    ``,
    `## Studyhall checks`,
    ``,
    `- Citation validity (cited numbers that matched a real source): **${pct(s.studyhall.citationValidity)}**`,
    `- Unsupported-claim rate after the repair pass: **${pct(s.studyhall.unsupportedClaimRate)}**`,
    ``,
    `| Confidence badge | n | Correct | Partial | Wrong | Declined | Accuracy |`,
    `|---|---|---|---|---|---|---|`,
    ...(["high", "medium", "low"] as const).map((l) => {
      const v = s.studyhall.confidenceByVerdict[l];
      return `| ${l} | ${s.studyhall.accuracyByConfidence[l].n} | ${v.correct} | ${v.partial} | ${v.wrong} | ${v.declined} | ${pct(s.studyhall.accuracyByConfidence[l].accuracy)} |`;
    }),
    ``,
    `## Grading cross-check`,
    ``,
    ...s.systems.map((x) => `- ${x.name}: term match agreed with the judge on ${pct(x.termJudgeAgreement)} of answers; ${x.errors} system errors.`),
    `- Judge cost: $${judgeCost.toFixed(3)}. Costs use list prices (Claude: Anthropic API rates; You.com: published usage-based rates, Research API at "${RESEARCH_EFFORT}" effort).`,
    ``,
  ];
  return lines.join("\n");
}

/** Deterministic shuffle so the spot-check sample is reproducible. */
function seeded<T>(xs: T[], seed = 42): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function spotcheck(questions: EvalQuestion[], rows: GradedRow[], details: Record<string, { reason: string; answer: string }>): string {
  const byId = new Map(questions.map((q) => [q.id, q]));
  // 10 different questions, systems taken in turn (B, A, C, B, …), each system's rows shuffled with its own seed.
  const pools = new Map(SYSTEMS.map((s, i) => [s, seeded(rows.filter((r) => r.system === s && !r.error), 42 + i * 7919)]));
  const order = (["B", "A", "C"] as SystemId[]).filter((s) => pools.has(s));
  const used = new Set<string>();
  const sample: GradedRow[] = [];
  for (let i = 0; sample.length < 10 && i < 100; i++) {
    const next = pools.get(order[i % order.length]!)!.find((r) => !used.has(r.id));
    if (next) {
      used.add(next.id);
      sample.push(next);
    }
  }
  return [
    `# Human spot-check`,
    ``,
    `10 graded answers picked at random (seeded) across the three systems. Grade each by hand against the expected answer, using the same verdicts as the judge: correct, partial, wrong, declined. Leave the judge's verdict alone; we compare the two afterwards. If agreement is under 90%, the judge gets fixed before any number is quoted.`,
    ``,
    ...sample.flatMap((r, i) => {
      const q = byId.get(r.id)!;
      const d = details[`${r.system}:${r.id}`]!;
      return [
        `## ${i + 1}. ${r.id} (system ${r.system}: ${SYSTEM_NAMES[r.system]})`,
        ``,
        `**Question:** ${q.question}`,
        ``,
        `**Expected (verified ${q.checked_on}):** ${q.expected}`,
        ``,
        `**Answer:**`,
        ``,
        ...d.answer.split("\n").map((l) => `> ${l}`),
        ``,
        `**Judge verdict:** ${r.verdict}. ${d.reason}`,
        ``,
        `**Human verdict:** ______`,
        ``,
        `**Notes:** ______`,
        ``,
      ];
    }),
  ].join("\n");
}

function demoQuestions(questions: EvalQuestion[], rows: GradedRow[], details: Record<string, { reason: string; answer: string }>): string {
  const v = (id: string, s: SystemId) => rows.find((r) => r.id === id && r.system === s);
  const candidates = questions
    .filter((q) => q.type === "time-sensitive" && !q.volatile)
    .filter((q) => v(q.id, "A")?.verdict === "wrong" && v(q.id, "B")?.verdict === "correct")
    .sort((a, b) => {
      const conf = (q: EvalQuestion) => ({ high: 0, medium: 1, low: 2 })[v(q.id, "B")!.studyhall?.confidence ?? "low"];
      return conf(a) - conf(b) || (v(a.id, "B")!.latencyMs - v(b.id, "B")!.latencyMs);
    });
  const picked: EvalQuestion[] = [];
  for (const q of candidates) if (!picked.some((p) => p.category === q.category) && picked.length < 3) picked.push(q);
  return [
    `# Recommended demo questions`,
    ``,
    `Picked from eval run ${RUN}: the bare model answered wrongly from memory and Studyhall answered correctly, on a time-sensitive, non-volatile fact with an official source. Use them with "Compare with no search" on.`,
    ``,
    ...picked.flatMap((q, i) => {
      const b = v(q.id, "B")!;
      return [
        `## ${i + 1}. ${q.question}`,
        ``,
        `- **Category:** ${getCategory(q.category)?.name ?? q.category}`,
        `- **Correct answer (verified ${q.checked_on}):** ${q.expected}`,
        `- **Official source:** ${q.sources[0]}`,
        `- **Bare model said:** ${details[`A:${q.id}`]!.answer.replace(/\s+/g, " ").slice(0, 300)}${details[`A:${q.id}`]!.answer.length > 300 ? "…" : ""}`,
        `- **Judge on the bare model:** ${details[`A:${q.id}`]!.reason}`,
        `- **Studyhall:** correct, ${b.studyhall?.confidence ?? "?"} confidence, ${(b.latencyMs / 1000).toFixed(1)}s.`,
        ``,
      ];
    }),
    ...(picked.length < 3 ? [`Only ${picked.length} questions met all the criteria in this run.`, ``] : []),
  ].join("\n");
}

/** --report-only: rebuild the reports from graded.jsonl without calling the judge again. */
function loadGraded(questions: EvalQuestion[]): { rows: GradedRow[]; judgeCost: number; details: Record<string, { reason: string; answer: string; found: string[] }> } {
  const ids = new Set(questions.map((q) => q.id));
  const lines = readFileSync(join(runDir, "graded.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as GradedRow & { judgeReason: string });
  const rows: GradedRow[] = [];
  const details: Record<string, { reason: string; answer: string; found: string[] }> = {};
  for (const { judgeReason, ...r } of lines) {
    if (!ids.has(r.id)) continue;
    rows.push(r);
    const raw = JSON.parse(readFileSync(join(runDir, "raw", r.system, `${r.id}.json`), "utf8")) as RawAnswer;
    details[`${r.system}:${r.id}`] = { reason: judgeReason, answer: raw.answer, found: [] };
  }
  const prev = existsSync(join(runDir, "results.json")) ? (JSON.parse(readFileSync(join(runDir, "results.json"), "utf8")) as { judgeCostUsd?: number }) : {};
  return { rows, judgeCost: prev.judgeCostUsd ?? 0, details };
}

// ---------------------------------------------------------------- main

async function main() {
  loadEnv(root);
  const questions = loadQuestions();
  mkdirSync(runDir, { recursive: true });
  console.log(`run ${RUN}: ${questions.length} questions × systems ${SYSTEMS.join(",")} · concurrency ${CONCURRENCY} · dev cache off`);
  const reportOnly = has("report-only");
  if (!has("grade-only") && !reportOnly) await answerAll(questions);
  const { rows, judgeCost, details } = reportOnly ? loadGraded(questions) : await gradeAll(questions);
  const summary = summarize(rows);
  const spotFile = join(root, "evals", "spotcheck.md");
  const spot = existsSync(spotFile) ? spotcheckAgreement(readFileSync(spotFile, "utf8")) : null;
  if (spot?.graded) console.log(`spot-check: ${spot.agree}/${spot.graded} agree (${pct(spot.agreement)}); disagreements: ${spot.disagreements.map((d) => `${d.system}:${d.id} judge=${d.judge} human=${d.human}`).join("; ") || "none"}`);
  // The spot-check counts only for the run it sampled: every sampled answer must still carry the verdict the human saw.
  const spotApplies = Boolean(spot && spot.total > 0 && spot.graded === spot.total && spot.items.every((it) => rows.some((r) => r.id === it.id && r.system === it.system && r.verdict === it.judge)));
  const spotLine = spotApplies ? `Judge grades hand-checked on a ${spot!.total}-answer sample, ${pct(spot!.agreement)} agreement ([spotcheck.md](spotcheck.md)).` : undefined;
  const md = resultsMarkdown(questions, summary, judgeCost, spotLine);
  const json = {
    generatedAt: new Date().toISOString(),
    run: RUN,
    questions: questions.length,
    timeSensitive: questions.filter((q) => q.type === "time-sensitive").length,
    researchEffort: RESEARCH_EFFORT,
    judgeModel: "claude-sonnet-5-5",
    judgeCostUsd: judgeCost,
    spotcheck: spotApplies ? { status: "done", agreement: spot!.agreement, n: spot!.total } : { status: "pending", agreement: null as number | null },
    pitch: summary.pitch,
    systems: summary.systems.map((x) => ({
      ...x,
      refusalRate: x.declined,
      ...(x.system === "B" ? { citationValidity: summary.studyhall.citationValidity, unsupportedClaimRate: summary.studyhall.unsupportedClaimRate } : {}),
    })),
    studyhall: summary.studyhall,
  };
  writeFileSync(join(runDir, "results.json"), JSON.stringify(json, null, 2) + "\n");
  writeFileSync(join(runDir, "results.md"), md);
  if (has("publish")) {
    writeFileSync(join(root, "evals", "results.json"), JSON.stringify(json, null, 2) + "\n");
    writeFileSync(join(root, "evals", "results.md"), md);
    // Never overwrite a spot-check a human has started grading.
    if (!spot?.graded) writeFileSync(spotFile, spotcheck(questions, rows, details));
    else console.log("evals/spotcheck.md has human verdicts; left as is.");
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "demo-questions.md"), demoQuestions(questions, rows, details));
  }
  // Cost and time per question, measured, and the projection for the full question set.
  const all = readFileSync(join(root, "evals", "questions.jsonl"), "utf8").trim().split("\n").length;
  console.log(`\n${md.split("\n").slice(0, 12).join("\n")}`);
  console.log(`\nMeasured per question → projected for all ${all} questions:`);
  let total = 0;
  for (const x of summary.systems) {
    total += x.costPerQuestionUsd * all;
    const ms = rows.filter((r) => r.system === x.system).map((r) => r.latencyMs);
    console.log(`  ${x.system} ${x.name}: $${x.costPerQuestionUsd.toFixed(4)}/q → $${(x.costPerQuestionUsd * all).toFixed(2)}; median ${(median(ms) / 1000).toFixed(1)}s`);
  }
  const jPerQ = rows.length ? judgeCost / rows.length : 0;
  total += jPerQ * all * summary.systems.length;
  console.log(`  judge: $${jPerQ.toFixed(4)}/answer → $${(jPerQ * all * summary.systems.length).toFixed(2)}`);
  console.log(`  TOTAL projected: $${total.toFixed(2)}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
