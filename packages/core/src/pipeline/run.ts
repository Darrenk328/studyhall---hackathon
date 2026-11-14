import { AUTO_ID, getCategory, UnknownCategoryError } from "../categories/registry.js";
import type { Category } from "../categories/types.js";
import { ClaudeClient, ClaudeRefusalError } from "../providers/claude.js";
import { YouClient } from "../providers/you.js";
import { answerSystemPrompt, answerUserPrompt, insufficientMessage, noResultsMessage, refusalMessage } from "./answer.js";
import { classifyCategory } from "./classify.js";
import { planQueries } from "./plan.js";
import { readSources, usableSources } from "./read.js";
import { computeConfidence, sourceAge } from "./receipts.js";
import { searchAll } from "./search.js";
import { citedIds, sanitizeCitations } from "./text.js";
import type { Claim, Outcome, PipelineEvent, PipelineOptions, ReadSource, Receipts, Source, Step } from "./types.js";
import { applyRepairs, repairAnswer, verifyAnswer } from "./verify.js";

const DEFAULTS = { perQuery: 10, topN: 8, readK: 5, perSourceChars: 6_000, totalChars: 30_000 };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const stripText = ({ text: _t, ...s }: ReadSource): Source => s;

/**
 * The Studyhall pipeline (PLAN.md §4): classify? -> plan -> search -> read -> answer -> verify -> repair? -> receipts.
 * Streams typed events. The last event is always `done` with the full receipts.
 */
export async function* answer(question: string, categoryId: string = AUTO_ID, opts: PipelineOptions = {}): AsyncGenerator<PipelineEvent> {
  const o = { ...DEFAULTS, ...opts };
  const now = (opts.now ?? (() => new Date()))();
  const t0 = performance.now();
  const timings: Partial<Record<Step, number>> = {};
  const models: Receipts["models"] = {};
  const notes: string[] = [];
  const time = async <T>(step: Step, fn: () => Promise<T>): Promise<T> => {
    const t = performance.now();
    try {
      return await fn();
    } finally {
      timings[step] = Math.round(performance.now() - t);
    }
  };

  const you = opts.you ?? new YouClient();
  const claude = opts.claude ?? new ClaudeClient();

  // ---------- category ----------
  let category: Category;
  let auto = false;
  if (categoryId.trim().toLowerCase() === AUTO_ID) {
    auto = true;
    const c = await time("classify", () => classifyCategory(claude, question));
    if (c.model) models.classify = c.model;
    if (c.fallback) notes.push(`Category classifier failed; used "${c.categoryId}".`);
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
  let removedCitations: number[] = [];

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
      confidence,
      confidenceReasons: reasons,
      asOf: now.toISOString(),
      ...(age.ms !== undefined ? { newestSourceAgeMs: age.ms, newestSourceAge: age.human! } : {}),
      citedDomains: [...new Set(cited.map((s) => s.domain))],
      removedCitations,
      models,
      timingsMs: { ...timings, total: Math.round(performance.now() - t0) },
      notes,
      ...extra,
    };
    return { type: "done", receipts };
  };

  // ---------- plan ----------
  yield { type: "planning" };
  const plan = await time("plan", () => planQueries(claude, question, category, now));
  queries = plan.queries;
  if (plan.model) models.plan = plan.model;
  if (plan.fallback) notes.push("Query planner failed; searched the question directly.");
  yield { type: "queries", queries };

  // ---------- search ----------
  yield { type: "searching", count: queries.length };
  let searched;
  try {
    searched = await time("search", () => searchAll(you, queries, category, now, { perQuery: o.perQuery, topN: o.topN }));
  } catch (err) {
    yield { type: "error", step: "search", message: errMsg(err) };
    text = noResultsMessage(category, queries);
    yield { type: "answer_delta", text };
    yield finish("error", { error: { step: "search", message: errMsg(err) } });
    return;
  }
  if (searched.freshnessRelaxed) notes.push(`Too few results within one ${category.freshness}; also searched without a date filter.`);
  for (const f of searched.failedQueries) notes.push(`Search failed for "${f.query}": ${f.error}`);

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
      score: Math.round(c.score * 100) / 100,
    })),
  };

  // ---------- read ----------
  yield { type: "reading", count: Math.min(o.readK, searched.candidates.length) };
  const read = await time("read", () => readSources(you, searched.candidates, question, o));
  sources = read.sources;
  if (read.contentsError) notes.push(`Contents API failed; used snippets: ${read.contentsError}`);

  const usable = usableSources(sources);
  if (usable.length < category.minSources) {
    text = insufficientMessage(category, usable);
    yield { type: "answer_delta", text };
    yield finish("insufficient_sources");
    return;
  }

  // ---------- answer (streaming) ----------
  try {
    const t = performance.now();
    const gen = claude.stream({
      role: "answer",
      system: answerSystemPrompt(category, now),
      prompt: answerUserPrompt(question, usable),
    });
    let step = await gen.next();
    while (!step.done) {
      text += step.value;
      yield { type: "answer_delta", text: step.value };
      step = await gen.next();
    }
    timings.answer = Math.round(performance.now() - t);
    models.answer = step.value.model;
    if (step.value.failedOver) notes.push(`Answer model was overloaded; ${step.value.model} answered.`);
    if (step.value.truncated) notes.push("Answer hit the token limit and may be cut off.");
    text = step.value.text || text;
  } catch (err) {
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

  // ---------- citation clean-up ----------
  const sanitized = sanitizeCitations(text, new Set(usable.map((s) => s.id)));
  removedCitations = sanitized.removed;
  if (sanitized.removed.length) {
    text = sanitized.text;
    yield { type: "answer_replaced", text, reason: "sanitized" };
  }

  // ---------- verify ----------
  yield { type: "verifying" };
  try {
    const v = await time("verify", () => verifyAnswer(claude, text, usable));
    claims = v.claims;
    models.verify = v.model;
  } catch (err) {
    notes.push(`Verification failed: ${errMsg(err)}`);
    yield finish("answered");
    return;
  }
  yield { type: "verdicts", claims };

  // ---------- repair (at most once) ----------
  const unsupported = claims.filter((c) => c.verdict === "unsupported");
  if (unsupported.length) {
    try {
      const r = await time("repair", () => repairAnswer(claude, text, unsupported, usable));
      models.repair = r.model;
      const cleaned = sanitizeCitations(r.answer, new Set(usable.map((s) => s.id)));
      if (cleaned.text.trim()) {
        text = cleaned.text;
        claims = applyRepairs(claims, r.edits);
        yield { type: "answer_replaced", text, reason: "repaired" };
        yield { type: "verdicts", claims };
      }
    } catch (err) {
      notes.push(`Repair pass failed; unsupported sentences were left in place: ${errMsg(err)}`);
    }
  }

  yield finish("answered");
}

/** Run the pipeline to completion and return only the receipts. */
export async function answerToReceipts(question: string, categoryId?: string, opts?: PipelineOptions): Promise<Receipts> {
  let receipts: Receipts | undefined;
  for await (const ev of answer(question, categoryId, opts)) if (ev.type === "done") receipts = ev.receipts;
  return receipts!;
}
