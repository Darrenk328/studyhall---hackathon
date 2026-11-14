import type { ClaudeClient } from "../providers/claude.js";
import type { PageContent, SearchHit, SearchParams } from "../providers/you.js";

export type ReadStatus = "full" | "snippets";
/**
 * "meta": the sentence talks about the sources or the answer itself ("that snippet is partial",
 * "these pages appear older"). Shown, not graded, not counted toward confidence.
 */
export type Verdict = "supported" | "partial" | "unsupported" | "meta";
export type Confidence = "high" | "medium" | "low";
export type Outcome = "answered" | "refused" | "insufficient_sources" | "no_results" | "error";
export type Step = "classify" | "plan" | "release" | "search" | "read" | "notes" | "answer" | "verify" | "repair" | "reverify";

/** A ranked, deduplicated search result. Ids are 1-based and match the [n] citations. */
export interface Source {
  id: number;
  url: string;
  title: string;
  domain: string;
  /** ISO timestamp from You.com `page_age`, when present. */
  published?: string;
  score: number;
  /** Queries that returned this URL. */
  foundBy: string[];
  preferred: boolean;
  /** Official or primary source for this category (see Category.authorityDomains). */
  authority: boolean;
  readStatus: ReadStatus;
  /** Why a source is snippets-only, e.g. "page could not be crawled". */
  readNote?: string;
  cited: boolean;
}

/** Source plus the text the answer step saw. Internal; receipts carry `Source`. */
export interface ReadSource extends Source {
  text: string;
}

export interface Claim {
  text: string;
  sourceIds: number[];
  verdict: Verdict;
  note: string;
  /** Short supporting quote from a cited source, when the checker found one. */
  evidence: string;
  /** Character offsets of `text` in the final answer, for underlining. Null if it couldn't be located. */
  span: { start: number; end: number } | null;
  /** "rewritten": the repair pass changed this sentence and it was re-verified. "removed": deleted by repair. */
  repair?: "rewritten" | "removed";
  /** "code": a function or command used in a code block, checked against the cited sources. */
  kind?: "code";
}

/** Which software a version-aware answer is about (Engineering Software). */
export interface SoftwareContext {
  apps: { id: string; name: string }[];
  /** selected: the user picked an app chip; named: the question names it; unspecified: the answer says what it assumed. */
  how: "selected" | "named" | "unspecified";
  /** A version or release the user mentioned (from the planner), if any. */
  version: string | null;
}

export interface NoteItem {
  text: string;
  sourceIds: number[];
}

/** Haiku's study notes from the sources that were read (PLAN §4 step 4), shown on the website. */
export interface StudyNotes {
  /** What the question is really asking, in one sentence. */
  focus: string;
  keyPoints: NoteItem[];
  conflicts: NoteItem[];
  mayBeStale: NoteItem[];
}

export interface RepairEdit {
  original: string;
  action: "softened" | "cited" | "removed";
  revised: string;
}

export interface Receipts {
  question: string;
  categoryId: string;
  /** True when the auto classifier picked the category. */
  categoryAuto: boolean;
  outcome: Outcome;
  /** Final answer markdown (after citation clean-up and repair). */
  answer: string;
  queries: string[];
  sources: Source[];
  /** Claims in the final answer text (every non-null span points into `answer`). */
  claims: Claim[];
  /** Claims the repair pass deleted, kept for the audit trail. */
  removedClaims: Claim[];
  repairEdits: RepairEdit[];
  studyNotes?: StudyNotes;
  /** Version-aware categories only. */
  software?: SoftwareContext;
  /** Version-aware, no version named: the app's current release and where it was found. */
  currentRelease?: import("./release.js").CurrentRelease;
  confidence: Confidence;
  confidenceReasons: string[];
  /** When this answer was produced (ISO). */
  asOf: string;
  /** Age of the newest cited source (or newest source if none cited). */
  newestSourceAgeMs?: number;
  newestSourceAge?: string;
  citedDomains: string[];
  /** Citation numbers the answer used that matched no source; removed. */
  removedCitations: number[];
  /** Model that actually produced each LLM step (after any overload failover). */
  models: Partial<Record<Step, string>>;
  timingsMs: Partial<Record<Step, number>> & { total: number };
  /** Things that went wrong or were adjusted along the way (failovers, relaxed freshness, failed steps). */
  warnings: string[];
  refusal?: { step: Step; category: string | null };
  error?: { step: Step; message: string };
}

export type SourceSummary = Pick<Source, "id" | "url" | "title" | "domain" | "published" | "preferred" | "authority" | "score">;

export type PipelineEvent =
  | { type: "category"; categoryId: string; auto: boolean }
  | { type: "planning" }
  | { type: "queries"; queries: string[] }
  | { type: "searching"; count: number }
  | { type: "sources"; sources: SourceSummary[] }
  | { type: "reading"; count: number }
  /** Study notes; arrives while the answer streams (the two steps run in parallel). */
  | { type: "notes"; notes: StudyNotes }
  | { type: "answer_delta"; text: string }
  /** The whole answer text changed (citation clean-up, repair, or a refusal/decline message). */
  | { type: "answer_replaced"; text: string; reason: "sanitized" | "repaired" | "refused" }
  | { type: "verifying" }
  | { type: "verdicts"; claims: Claim[] }
  | { type: "done"; receipts: Receipts }
  /** `step: "server"` is a transport-level failure reported by the API route, not by a pipeline step. */
  | { type: "error"; step: Step | "server"; message: string };

export interface SearchProvider {
  search(params: SearchParams, opts?: { signal?: AbortSignal }): Promise<SearchHit[]>;
  contents(urls: string[], opts?: { crawlTimeoutSec?: number; maxAgeSec?: number; signal?: AbortSignal }): Promise<PageContent[]>;
}

export type LlmProvider = Pick<ClaudeClient, "json" | "stream">;

/** One earlier question and answer in the same category, oldest first. */
export interface HistoryTurn {
  question: string;
  answer: string;
}

export interface PipelineOptions {
  you?: SearchProvider;
  claude?: LlmProvider;
  /** Cancels every upstream call (search, contents, Claude); the generator then throws an AbortError. */
  signal?: AbortSignal;
  /** Earlier turns, used to resolve follow-up questions. Context only, never a source. */
  history?: HistoryTurn[];
  /** App the user picked (version-aware categories), e.g. "fusion". */
  app?: string;
  now?: () => Date;
  /** Results requested per query. */
  perQuery?: number;
  /** Sources kept after ranking (PLAN default 8). */
  topN?: number;
  /** Sources sent to the Contents API (PLAN default 5). */
  readK?: number;
  /** Per-page crawl timeout in seconds (default 5). */
  crawlTimeoutSec?: number;
  perSourceChars?: number;
  totalChars?: number;
}
