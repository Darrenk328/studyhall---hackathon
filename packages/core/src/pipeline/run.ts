import { AUTO_ID, getCategory, UnknownCategoryError } from "../categories/registry.js";
import type { Category } from "../categories/types.js";
import { ClaudeClient, ClaudeRefusalError } from "../providers/claude.js";
import { YouClient } from "../providers/you.js";
import { answerSystemPrompt, answerUserPrompt, insufficientMessage, noResultsMessage, refusalMessage } from "./answer.js";
import { appFromName, disambiguateQueries, resolveApps, searchCategory, softwareLine, type ResolvedApps } from "./apps.js";
import { classifyCategory } from "./classify.js";
import { checkCode, extractCodeBlocks } from "./code.js";
import {
  assessCitedDocs,
  discoverCurrentRelease,
  ensureReleaseCandidate,
  mentionsCurrentRelease,
  prependOlderDocsNote,
  releaseQuery,
  releaseTerms,
  type CurrentRelease,
} from "./release.js";
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
  Usage,
} from "./types.js";
import { changedSentences, locateClaims, rebuildClaims, repairAnswer, reverifySentences, verifyAnswer } from "./verify.js";

/** Version-aware categories re-fetch pages whose cached copy is older than this. */
export const VERSION_AWARE_MAX_AGE_SEC = 3 * 86_400;

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
  // Every call also records its usage, for cost reporting.
  const usage: Usage = { llm: [], you: { searches: 0, contentsCalls: 0, contentsPages: 0 } };
  const record = (role: string, r: { model?: string; usage?: { inputTokens?: number; outputTokens?: number } }) =>
    usage.llm.push({ role, model: r.model ?? "unknown", inputTokens: r.usage?.inputTokens ?? 0, outputTokens: r.usage?.outputTokens ?? 0 });
  const you: SearchProvider = {
    search: (p, o) => {
      usage.you.searches++;
      return baseYou.search(p, { ...o, ...(signal ? { signal } : {}) });
    },
    contents: (u, o) => {
      usage.you.contentsCalls++;
      usage.you.contentsPages += u.length;
      return baseYou.contents(u, { ...o, ...(signal ? { signal } : {}) });
    },
  };
  const claude: LlmProvider = {
    json: (async (input: Parameters<LlmProvider["json"]>[0]) => {
      const res = await baseClaude.json({ ...input, ...(signal ? { signal } : {}) });
      record(input.role, res);
      return res;
    }) as LlmProvider["json"],
    stream: async function* (input) {
      const gen = baseClaude.stream({ ...input, ...(signal ? { signal } : {}) });
      let step = await gen.next();
      while (!step.done) {
        yield step.value;
        step = await gen.next();
      }
      record(input.role, step.value);
      return step.value;
    },
  };
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
  let currentRelease: CurrentRelease | undefined;

  const finish = (outcome: Outcome, extra: Partial<Receipts> = {}): PipelineEvent => {
    const validIds = new Set(sources.map((s) => s.id));
    const citedSet = new Set(citedIds(text).filter((n) => validIds.has(n)));
    const finalSources = sources.map((s) => ({ ...stripText(s), cited: citedSet.has(s.id) }));
    const cited = finalSources.filter((s) => s.cited);
    let { confidence, reasons } =
      outcome === "answered" ? computeConfidence(claims, cited, category, now) : { confidence: "low" as const, reasons: [`Outcome: ${outcome}.`] };
    if (currentRelease?.olderDocs) {
      // Docs for an older release than the current one can't earn High.
      const why = `The cited docs are for ${currentRelease.citedReleases?.join(" and ") || "an older release"}; the current release is ${currentRelease.release}.`;
      if (confidence === "high") {
        confidence = "medium";
        reasons = [why];
      } else reasons = [...reasons, why];
    }
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
      ...(currentRelease ? { currentRelease } : {}),
      usage,
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

  // ---------- current release (version-aware, runs alongside planning) ----------
  const discover = (app: NonNullable<typeof resolved>["apps"][number]) =>
    time("release", () => discoverCurrentRelease(you, claude, app, category, now)).catch((err: unknown) => {
      checkAbort();
      warnings.push(`Current-release lookup failed: ${errMsg(err)}`);
      return null;
    });
  let discovery = resolved?.apps.length === 1 ? discover(resolved.apps[0]!) : undefined;

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
    // The user named a version: answer for that one; no current-release lookup.
    if (software.version) discovery = undefined;
    else if (!discovery && fromPlanner) discovery = discover(fromPlanner);
    const found = discovery ? await discovery : null;
    checkAbort();
    if (found) {
      currentRelease = found;
      // Search for the current release's docs first.
      queries = [...new Set([releaseQuery(queries[0] ?? question, resolved.apps[0]!, found.release), ...queries])].slice(0, 5);
    }
  }
  let swLine = resolved ? softwareLine(resolved, software?.version ?? null) : undefined;
  const searchCat = resolved ? searchCategory(category, resolved) : category;
  if (plan.model) models.plan = plan.model;
  if (plan.fallback) warnings.push("Query planner failed; searched the question directly.");
  yield { type: "queries", queries };

  // ---------- search ----------
  yield { type: "searching", count: queries.length };
  let searched;
  try {
    searched = await time("search", () =>
      searchAll(you, queries, searchCat, now, {
        perQuery: o.perQuery,
        topN: o.topN,
        alsoUndated: Boolean(category.versionAware),
        ...(currentRelease ? { boostTerms: releaseTerms(currentRelease.release) } : {}),
      }),
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

  if (currentRelease && searched.candidates.length) {
    // Keep the release source among the sources so the answer can cite it.
    searched = { ...searched, candidates: ensureReleaseCandidate(searched.candidates, currentRelease, o.topN) };
  }
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
  // Version-aware categories need current release notes: refuse cached page copies older than 3 days
  // (You.com served the Fusion release notes weeks stale) and allow a slower live crawl.
  const readOpts = category.versionAware ? { ...o, crawlTimeoutSec: Math.max(o.crawlTimeoutSec, 8), maxAgeSec: VERSION_AWARE_MAX_AGE_SEC } : o;
  const read = await time("read", () => readSources(you, searched.candidates, question, readOpts));
  checkAbort();
  sources = read.sources;
  if (currentRelease) {
    const id = sources.find((s) => s.url === currentRelease!.source.url)?.id;
    if (id !== undefined) currentRelease = { ...currentRelease, sourceId: id };
    const cite = currentRelease.sourceId !== undefined ? ` [${currentRelease.sourceId}]` : "";
    swLine = `${swLine} The current release is ${currentRelease.release}${cite}. If the pages you use for the steps describe an older release, say so near the top, for example: "${currentRelease.release} is the current release${cite}; these steps come from the <older release> documentation and may differ slightly."`;
  }
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

  // ---------- current release vs the docs the answer cited ----------
  if (currentRelease) {
    const citedSet = new Set(citedIds(text));
    const { olderDocs, citedReleases } = assessCitedDocs(currentRelease, usable.filter((s) => citedSet.has(s.id)));
    currentRelease = { ...currentRelease, olderDocs, citedReleases };
    if (olderDocs && !mentionsCurrentRelease(text, currentRelease)) {
      const added = prependOlderDocsNote(text, claims, currentRelease, citedReleases);
      text = added.text;
      claims = [
        {
          text: added.note,
          sourceIds: currentRelease.sourceId !== undefined ? [currentRelease.sourceId] : [],
          verdict: currentRelease.sourceId !== undefined ? "supported" : "meta",
          note: "Added by Studyhall: the current release comes from the cited source; the other cited docs are for an older release.",
          evidence: "",
          span: { start: 0, end: added.note.length },
        },
        ...added.claims,
      ];
      warnings.push("The answer didn't say its docs are for an older release, so a note was added at the top.");
      yield { type: "answer_replaced", text, reason: "repaired" };
      yield { type: "verdicts", claims };
    }
  }
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
