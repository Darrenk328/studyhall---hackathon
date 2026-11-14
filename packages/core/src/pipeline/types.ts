import type { ClaudeClient } from "../providers/claude.js";
import type { PageContent, SearchHit, SearchParams } from "../providers/you.js";

export type ReadStatus = "full" | "snippets";
export type Verdict = "supported" | "partial" | "unsupported";
export type Confidence = "high" | "medium" | "low";
export type Outcome = "answered" | "refused" | "insufficient_sources" | "no_results" | "error";
export type Step = "classify" | "plan" | "search" | "read" | "answer" | "verify" | "repair";

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
  /** Set when the one repair pass rewrote or deleted the sentence. */
  repair?: "softened" | "cited" | "removed";
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
  claims: Claim[];
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
  notes: string[];
  refusal?: { step: Step; category: string | null };
  error?: { step: Step; message: string };
}

export type SourceSummary = Pick<Source, "id" | "url" | "title" | "domain" | "published" | "preferred" | "score">;

export type PipelineEvent =
  | { type: "category"; categoryId: string; auto: boolean }
  | { type: "planning" }
  | { type: "queries"; queries: string[] }
  | { type: "searching"; count: number }
  | { type: "sources"; sources: SourceSummary[] }
  | { type: "reading"; count: number }
  | { type: "answer_delta"; text: string }
  /** The whole answer text changed (citation clean-up, repair, or a refusal/decline message). */
  | { type: "answer_replaced"; text: string; reason: "sanitized" | "repaired" | "refused" }
  | { type: "verifying" }
  | { type: "verdicts"; claims: Claim[] }
  | { type: "done"; receipts: Receipts }
  | { type: "error"; step: Step; message: string };

export interface SearchProvider {
  search(params: SearchParams): Promise<SearchHit[]>;
  contents(urls: string[]): Promise<PageContent[]>;
}

export type LlmProvider = Pick<ClaudeClient, "json" | "stream">;

export interface PipelineOptions {
  you?: SearchProvider;
  claude?: LlmProvider;
  now?: () => Date;
  /** Results requested per query. */
  perQuery?: number;
  /** Sources kept after ranking (PLAN default 8). */
  topN?: number;
  /** Sources sent to the Contents API (PLAN default 5). */
  readK?: number;
  perSourceChars?: number;
  totalChars?: number;
}
