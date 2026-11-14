/**
 * Client-side state for "Check a claim": one pasted text and everything /api/check streamed back.
 * `applyCheckEvent` is a pure reducer, like `applyEvent` for answers, so it's testable without a browser.
 */
import type { CheckedClaim, CheckEvent, CheckPhase, CheckReceipts, ClaimVerdict, ExtractedClaim, SkippedSentence, SourceSummary } from "@studyhall/core";

/** Mirrors core's MAX_CHECK_CHARS (client code doesn't import core at runtime). */
export const MAX_CHECK_CHARS = 2_000;

/** A claim card: extracted first, then progress, then its verdict. */
export interface ClaimCard extends ExtractedClaim {
  phase?: CheckPhase;
  categoryId?: string;
  result?: CheckedClaim;
}

export type CheckStatus = "running" | "done" | "stopped" | "failed";

export interface CheckRun {
  id: string;
  text: string;
  status: CheckStatus;
  statusText: string;
  claims: ClaimCard[];
  skipped: SkippedSentence[];
  sources: SourceSummary[];
  receipts?: CheckReceipts;
  /** A message instead of results (no claims, search unavailable, failure). */
  message?: string;
  error?: string;
  startedAt: number;
  /** Demo mode: a replay of a check recorded at this ISO time. */
  replayOf?: string;
}

export function newCheckRun(text: string, id = crypto.randomUUID()): CheckRun {
  return { id, text, status: "running", statusText: "Getting started…", claims: [], skipped: [], sources: [], startedAt: Date.now() };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const PHASE_TEXT: Record<CheckPhase, string> = {
  classifying: "Picking a topic…",
  searching: "Searching…",
  reading: "Reading sources…",
  judging: "Weighing the evidence…",
};

export function applyCheckEvent(r: CheckRun, ev: CheckEvent): CheckRun {
  switch (ev.type) {
    case "extracting":
      return { ...r, statusText: "Finding the factual claims…" };
    case "claims":
      return {
        ...r,
        claims: ev.claims.map((c) => ({ ...c })),
        skipped: ev.skipped,
        statusText: ev.claims.length ? `Checking ${plural(ev.claims.length, "claim")} against the live web…` : "No checkable claims found.",
      };
    case "claim_progress":
      return { ...r, claims: r.claims.map((c) => (c.id === ev.id ? { ...c, phase: ev.phase, ...(ev.categoryId ? { categoryId: ev.categoryId } : {}) } : c)) };
    case "sources":
      return { ...r, sources: ev.sources };
    case "claim_verdict": {
      const claims = r.claims.map((c) => (c.id === ev.claim.id ? { ...c, result: ev.claim, categoryId: ev.claim.categoryId } : c));
      const done = claims.filter((c) => c.result).length;
      return { ...r, claims, statusText: `Checked ${done} of ${plural(claims.length, "claim")}…` };
    }
    case "check_done": {
      const rec = ev.receipts;
      const byId = new Map(rec.claims.map((c) => [c.id, c]));
      return {
        ...r,
        status: "done",
        receipts: rec,
        claims: r.claims.length ? r.claims.map((c) => ({ ...c, ...(byId.get(c.id) ? { result: byId.get(c.id)!, categoryId: byId.get(c.id)!.categoryId } : {}) })) : rec.claims.map((c) => ({ ...c, result: c })),
        skipped: rec.skipped,
        statusText: rec.outcome === "checked" ? `${rec.summary} · ${(rec.timingsMs.total / 1000).toFixed(1)}s` : "",
        ...(rec.message ? { message: rec.message } : {}),
      };
    }
    case "error":
      return r.claims.length ? r : { ...r, error: ev.message || "Something went wrong while checking." };
  }
}

/** The stream ended (normally, by error, or because the user pressed Stop). */
export function finishCheckRun(r: CheckRun, how: "ended" | "stopped" | "failed", message?: string): CheckRun {
  if (r.status === "done") return r;
  if (how === "stopped") return { ...r, status: "stopped", statusText: "Stopped." };
  const unfinished = r.claims.some((c) => !c.result);
  return {
    ...r,
    status: "failed",
    statusText: r.claims.length && unfinished ? "Connection ended before every claim was checked." : "",
    ...(r.claims.length ? {} : { error: r.error ?? message ?? "Something went wrong while checking. Please try again." }),
  };
}

export const VERDICT_LABEL: Record<ClaimVerdict, string> = {
  supported: "Supported",
  contradicted: "Contradicted",
  unverifiable: "Unverifiable",
};

/** Plain-language meaning of each verdict, for screen readers and the receipts. */
export const VERDICT_MEANING: Record<ClaimVerdict, string> = {
  supported: "The sources state this.",
  contradicted: "The sources say something different.",
  unverifiable: "The sources don't settle this, or disagree.",
};

/** Text split into plain and corrected parts, for highlighting the corrected version. */
export function correctedSegments(rec: Pick<CheckReceipts, "text" | "edits">): { text: string; original?: string }[] {
  const out: { text: string; original?: string }[] = [];
  let at = 0;
  for (const e of rec.edits) {
    if (e.start > at) out.push({ text: rec.text.slice(at, e.start) });
    out.push({ text: e.corrected, original: e.original });
    at = e.end;
  }
  if (at < rec.text.length) out.push({ text: rec.text.slice(at) });
  return out;
}

// ---------------------------------------------------------------- storage

const KEY = "studyhall:check:runs";
const MAX_RUNS = 5;

export function loadCheckRuns(): CheckRun[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const runs = raw ? (JSON.parse(raw) as CheckRun[]) : [];
    // A run that was streaming when the tab closed can't resume.
    return runs.map((r) => (r.status === "running" ? finishCheckRun(r, "stopped") : r));
  } catch {
    return [];
  }
}

export function saveCheckRuns(runs: CheckRun[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(runs.slice(-MAX_RUNS)));
  } catch {
    // storage full or blocked: the runs still show for this page view
  }
}
