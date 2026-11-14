import { AUTO_ID, getCategory, UnknownCategoryError } from "../categories/registry.js";
import type { Category } from "../categories/types.js";
import { ClaudeClient, ClaudeRefusalError } from "../providers/claude.js";
import { YouClient } from "../providers/you.js";
import { answerSystemPrompt, answerUserPrompt, insufficientMessage, noResultsMessage, refusalMessage } from "./answer.js";
import { appFromName, disambiguateQueries, resolveApps, searchCategory, softwareLine, type ResolvedApps } from "./apps.js";
import { classifyCategory } from "./classify.js";
import { checkCode, extractCodeBlocks } from "./code.js";
import { takeNotes } from "./notes.js";
import { planQueries } from "./plan.js";
import { readSources, usableSources } from "./read.js";
import { computeConfidence, sourceAge } from "./receipts.js";
import { searchAll } from "./search.js";
import { citedIds, sanitizeCitations } from "./text.js";
import type {
  Claim,
  LlmProvider,
  Outcome,
  PipelineEvent,
  PipelineOptions,
  ReadSource,
  Receipts,
  RepairEdit,
  SearchProvider,
  Source,
  Step,
  SoftwareContext,
  StudyNotes,
} from "./types.js";
import { changedSentences, locateClaims, rebuildClaims, repairAnswer, reverifySentences, verifyAnswer } from "./verify.js";

const DEFAULTS = { perQuery: 10, topN: 8, readK: 5, crawlTimeoutSec: 5, perSourceChars: 6_000, totalChars: 30_000 };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const stripText = ({ text: _t, ...s }: ReadSource): Source => s;

/**
 * The Studyhall pipeline (PLAN.md §4):
 * classify? -> plan -> search -> read -> (notes ‖ answer) -> verify -> repair? -> re-verify? -> receipts.
 * Streams typed events. The last event is always `done` with the full receipts.
 */
export async function* answer(question: string, categoryId: string = AUTO_ID, opts: PipelineOptions = {}): AsyncGenerator<PipelineEvent> {
  const o = { ...DEFAULTS, ...opts };
  const now = (opts.now ?? (() => new Date()))();
  const t0 = performance.now();
  const timings: Partial<Record<Step, number>> = {};
  const models: Receipts["models"] = {};
  const warnings: string[] = [];
  const time = async <T>(step: Step, fn: () => Promise<T>): Promise<T> => {
    const t = performance.now();
    try {
      return await fn();
    } finally {
      timings[step] = Math.round(performance.now() - t);
    }
  };

  // Bind cancellation once: every upstream call made through these sees the signal.
  const signal = opts.signal;
  const history = (opts.history ?? []).slice(-6);
  const baseYou = opts.you ?? new YouClient();
  const baseClaude = opts.claude ?? new ClaudeClient();
  const you: SearchProvider = signal
    ? { search: (p, o) => baseYou.search(p, { ...o, signal }), contents: (u, o) => baseYou.contents(u, { ...o, signal }) }
    : baseYou;
  const claude: LlmProvider = signal
    ? {
        json: ((input) => baseClaude.json({ ...input, signal })) as LlmProvider["json"],
        stream: (input) => baseClaude.stream({ ...input, signal }),
      }
    : baseClaude;
  /** Steps swallow some errors (fallbacks, warnings); this makes sure an abort still ends the run. */
  const checkAbort = () => signal?.throwIfAborted();

  // ---------- category ----------
  let category: Category;
  let auto = false;
  if (categoryId.trim().toLowerCase() === AUTO_ID) {
    auto = true;
    const c = await time("classify", () => classifyCategory(claude, question, history));
    checkAbort();
    if (c.model) models.classify = c.model;
    if (c.fallback) warnings.push(`Category classifier failed; used "${c.categoryId}".`);
    category = getCategory(c.categoryId)!;
  } else {
    const found = getCategory(categoryId);
    if (!found) throw new UnknownCategoryError(categoryId);
    category = found;
  }
  yield { type: "category", categoryId: category.id, auto };

  let queries: string[] = [];
  let sources: ReadSource[] = [];
  let text = "";
  let claims: Claim[] = [];
  let removedClaims: Claim[] = [];
  let repairEdits: RepairEdit[] = [];
  let removedCitations: number[] = [];
  let studyNotes: StudyNotes | undefined;
  // Version-aware categories (Engineering Software): which app the question is about.
  let resolved: ResolvedApps | undefined = category.versionAware ? resolveApps(question, category, opts.app) : undefined;
  let software: SoftwareContext | undefined;

  const finish = (outcome: Outcome, extra: Partial<Receipts> = {}): PipelineEvent => {
    const validIds = new Set(sources.map((s) => s.id));
    const citedSet = new Set(citedIds(text).filter((n) => validIds.has(n)));
    const finalSources = sources.map((s) => ({ ...stripText(s), cited: citedSet.has(s.id) }));
    const cited = finalSources.filter((s) => s.cited);
    const { confidence, reasons } =
      outcome === "answered" ? computeConfidence(claims, cited, category, now) : { confidence: "low" as const, reasons: [`Outcome: ${outcome}.`] };
    const age = sourceAge(cited.length ? cited : finalSources, now);
    const receipts: Receipts = {
      question,
      categoryId: category.id,
      categoryAuto: auto,
      outcome,
      answer: text,
      queries,
      sources: finalSources,
      claims,
      removedClaims,
      repairEdits,
      ...(studyNotes && outcome !== "refused" ? { studyNotes } : {}),
      ...(software ? { software } : {}),
      confidence,
      confidenceReasons: reasons,
      asOf: now.toISOString(),
      ...(age.ms !== undefined ? { newestSourceAgeMs: age.ms, newestSourceAge: age.human! } : {}),
      citedDomains: [...new Set(cited.map((s) => s.domain))],
      removedCitations,
      models,
      timingsMs: { ...timings, total: Math.round(performance.now() - t0) },
      warnings,
      ...extra,
    };
    return { type: "done", receipts };
  };

  // ---------- plan ----------
  yield { type: "planning" };
  const plan = await time("plan", () => planQueries(claude, question, category, now, history, resolved));
  checkAbort();
  queries = plan.queries;
  if (resolved) {
    // The planner can recognise an app the aliases missed ("SW 2026" → SOLIDWORKS).
    const fromPlanner = resolved.how === "unspecified" ? appFromName(plan.software, category) : undefined;
    if (fromPlanner) {
      resolved = { apps: [fromPlanner], how: "named" };
      queries = disambiguateQueries(queries, question, resolved, now);
    }
    software = { apps: resolved.apps.map((a) => ({ id: a.id, name: a.name })), how: resolved.how, version: plan.version ?? null };
  }
  const swLine = resolved ? softwareLine(resolved, software?.version ?? null) : undefined;
  const searchCat = resolved ? searchCategory(category, resolved) : category;
  if (plan.model) models.plan = plan.model;
  if (plan.fallback) warnings.push("Query planner failed; searched the question directly.");
  yield { type: "queries", queries };

  // ---------- search ----------
  yield { type: "searching", count: queries.length };
  let searched;
  try {
    searched = await time("search", () =>
      searchAll(you, queries, searchCat, now, { perQuery: o.perQuery, topN: o.topN, alsoUndated: Boolean(category.versionAware) }),
    );
  } catch (err) {
    checkAbort();
    yield { type: "error", step: "search", message: errMsg(err) };
    text = noResultsMessage(category, queries);
    yield { type: "answer_delta", text };
    yield finish("error", { error: { step: "search", message: errMsg(err) } });
    return;
  }
  if (searched.freshnessRelaxed) warnings.push(`Too few results within one ${category.freshness}; also searched without a date filter.`);
  for (const f of searched.failedQueries) warnings.push(`Search failed for "${f.query}": ${f.error}`);

  if (searched.candidates.length === 0) {
    text = noResultsMessage(category, queries);
    yield { type: "answer_delta", text };
    yield finish("no_results");
    return;
  }
  yield {
    type: "sources",
    sources: searched.candidates.map((c, i) => ({
      id: i + 1,
      url: c.url,
      title: c.title,
      domain: c.domain,
      ...(c.published ? { published: c.published.toISOString() } : {}),
      preferred: c.preferred,
      authority: c.authority,
      score: Math.round(c.score * 100) / 100,
    })),
  };

  // ---------- read ----------
  yield { type: "reading", count: Math.min(o.readK, searched.candidates.length) };
  checkAbort();
  const read = await time("read", () => readSources(you, searched.candidates, question, o));
  checkAbort();
  sources = read.sources;
  if (read.contentsError) warnings.push(`Contents API failed; used snippets: ${read.contentsError}`);

  const usable = usableSources(sources);
  if (usable.length < category.minSources) {
    text = insufficientMessage(category, usable);
    yield { type: "answer_delta", text };
    yield finish("insufficient_sources");
    return;
  }

  // ---------- study notes (in parallel with the answer) ----------
  let notesDone = false;
  let notesEmitted = false;
  const notesTask = time("notes", () =>
    takeNotes(claude, question, usable, now, { versionAware: Boolean(category.versionAware), ...(swLine ? { software: swLine } : {}) }),
  ).then(
    (n) => {
      studyNotes = n.notes;
      models.notes = n.model;
      notesDone = true;
    },
    (err: unknown) => {
      warnings.push(`Study notes failed: ${errMsg(err)}`);
      notesDone = true;
    },
  );
  const notesEvent = (): PipelineEvent | undefined => {
    if (!notesDone || notesEmitted) return undefined;
    notesEmitted = true;
    return studyNotes ? { type: "notes", notes: studyNotes } : undefined;
  };

  // ---------- answer (streaming) ----------
  try {
    const t = performance.now();
    const gen = claude.stream({
      role: "answer",
      system: answerSystemPrompt(category, now),
      prompt: answerUserPrompt(question, usable, history, swLine),
    });
    let step = await gen.next();
    while (!step.done) {
      text += step.value;
      yield { type: "answer_delta", text: step.value };
      const ev = notesEvent();
      if (ev) yield ev;
      step = await gen.next();
    }
    timings.answer = Math.round(performance.now() - t);
    models.answer = step.value.model;
    if (step.value.failedOver) warnings.push(`Answer model was overloaded; ${step.value.model} answered.`);
    if (step.value.truncated) warnings.push("Answer hit the token limit and may be cut off.");
    text = step.value.text || text;
  } catch (err) {
    await notesTask;
    checkAbort();
    if (err instanceof ClaudeRefusalError) {
      models.answer = err.model;
      text = refusalMessage(category);
      yield { type: "answer_replaced", text, reason: "refused" };
      yield finish("refused", { refusal: { step: "answer", category: err.category } });
      return;
    }
    yield { type: "error", step: "answer", message: errMsg(err) };
    yield finish("error", { error: { step: "answer", message: errMsg(err) } });
    return;
  }
  // Notes don't gate anything: verify starts now, and the notes event goes out whenever notes finish.
  const readyNotes = notesEvent();
  if (readyNotes) yield readyNotes;

  // ---------- citation clean-up ----------
  const validIds = new Set(usable.map((s) => s.id));
  const sanitized = sanitizeCitations(text, validIds);
  removedCitations = sanitized.removed;
  if (sanitized.removed.length) {
    text = sanitized.text;
    yield { type: "answer_replaced", text, reason: "sanitized" };
  }

  // ---------- verify ----------
  yield { type: "verifying" };
  const verifyTask = time("verify", () => verifyAnswer(claude, text, usable));
  if (!notesEmitted) {
    const first = await Promise.race([verifyTask.then(() => "verify", () => "verify"), notesTask.then(() => "notes")]);
    if (first === "notes") {
      const ev = notesEvent();
      if (ev) yield ev;
    }
  }
  try {
    const v = await verifyTask;
    claims = v.claims;
    models.verify = v.model;
  } catch (err) {
    checkAbort();
    claims = withCodeChecks([], text, usable);
    warnings.push(`Verification failed: ${errMsg(err)}`);
    await notesTask;
    const ev = notesEvent();
    if (ev) yield ev;
    yield finish("answered");
    return;
  }
  {
    // Notes normally land long before verify finishes; flush them if they're still pending.
    await notesTask;
    const ev = notesEvent();
    if (ev) yield ev;
  }
  yield { type: "verdicts", claims };

  // ---------- repair (at most once), then re-verify only what it rewrote ----------
  const unsupported = claims.filter((c) => c.verdict === "unsupported");
  if (unsupported.length) {
    try {
      const r = await time("repair", () => repairAnswer(claude, text, unsupported, usable));
      models.repair = r.model;
      repairEdits = r.edits;
      const repaired = sanitizeCitations(r.answer, validIds).text;
      if (repaired.trim()) {
        const rewritten = changedSentences(text, repaired);
        let reverified: Claim[] = [];
        if (rewritten.length) {
          try {
            const rv = await time("reverify", () => reverifySentences(claude, rewritten, usable));
            reverified = rv.claims;
            models.reverify = rv.model;
          } catch (err) {
            checkAbort();
            warnings.push(`Re-verification failed; rewritten sentences are ungraded: ${errMsg(err)}`);
            reverified = rewritten.map((s) => ({
              text: s, sourceIds: citedIds(s).filter((n) => validIds.has(n)), verdict: "partial" as const,
              note: "Rewritten by the repair pass; re-verification failed.", evidence: "", span: null, repair: "rewritten" as const,
            }));
          }
        }
        text = repaired;
        const rebuilt = rebuildClaims(text, claims, reverified);
        claims = rebuilt.claims;
        removedClaims = rebuilt.removed;
        yield { type: "answer_replaced", text, reason: "repaired" };
        yield { type: "verdicts", claims };
      }
    } catch (err) {
      checkAbort();
      warnings.push(`Repair pass failed; unsupported sentences were left in place: ${errMsg(err)}`);
    }
  }

  checkAbort();
  claims = withCodeChecks(locateClaims(text, claims), text, usable);
  const unlocated = claims.filter((c) => !c.span).length;
  if (unlocated) warnings.push(`${unlocated} claim${unlocated === 1 ? "" : "s"} could not be located in the final answer text.`);
  yield finish("answered");
}

/**
 * Code is checked deterministically (every called function must appear in a cited source). Prose
 * claims that landed inside a code block are dropped; code claims are appended.
 */
function withCodeChecks(claims: Claim[], text: string, usable: ReadSource[]): Claim[] {
  const blocks = extractCodeBlocks(text);
  if (!blocks.length) return claims;
  const inCode = (c: Claim) => c.span !== null && blocks.some((b) => c.span!.start >= b.start && c.span!.end <= b.end);
  return [...claims.filter((c) => c.kind === "code" || !inCode(c)), ...checkCode(text, usable)];
}

/** Run the pipeline to completion and return only the receipts. */
export async function answerToReceipts(question: string, categoryId?: string, opts?: PipelineOptions): Promise<Receipts> {
  let receipts: Receipts | undefined;
  for await (const ev of answer(question, categoryId, opts)) if (ev.type === "done") receipts = ev.receipts;
  return receipts!;
}
