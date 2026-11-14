/**
 * Client-side turn state: one question and everything the pipeline streamed back for it.
 * `applyEvent` is a pure reducer so the UI logic is testable without a browser.
 */
import type { Claim, PipelineEvent, Receipts, SourceSummary, StudyNotes } from "@studyhall/core";

export type TurnStatus = "running" | "done" | "stopped" | "failed";
export type Phase = "starting" | "planning" | "searching" | "reading" | "answering" | "verifying" | "repairing" | "finished";

export interface Turn {
  id: string;
  question: string;
  /** Category the question was asked in (may be "auto"). */
  categoryId: string;
  /** Category the pipeline used (differs when auto picked one). */
  resolvedCategory?: string;
  status: TurnStatus;
  phase: Phase;
  statusText: string;
  queries: string[];
  sources: SourceSummary[];
  readingCount?: number;
  notes?: StudyNotes;
  answer: string;
  claims: Claim[];
  receipts?: Receipts;
  /** Set when the answer arrived but verification didn't finish (error, disconnect, stop). */
  unverified?: string;
  /** Set when nothing usable came back. */
  error?: string;
  startedAt: number;
}

export function newTurn(question: string, categoryId: string, id = crypto.randomUUID()): Turn {
  return {
    id,
    question,
    categoryId,
    status: "running",
    phase: "starting",
    statusText: "Getting started…",
    queries: [],
    sources: [],
    answer: "",
    claims: [],
    startedAt: Date.now(),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function applyEvent(t: Turn, ev: PipelineEvent): Turn {
  switch (ev.type) {
    case "category":
      return { ...t, resolvedCategory: ev.categoryId };
    case "planning":
      return { ...t, phase: "planning", statusText: "Planning searches…" };
    case "queries":
      return { ...t, queries: ev.queries };
    case "searching":
      return { ...t, phase: "searching", statusText: `Searching ${plural(ev.count, "query", "queries")}…` };
    case "sources":
      return { ...t, sources: ev.sources, statusText: `Found ${plural(ev.sources.length, "source")}…` };
    case "reading":
      return { ...t, phase: "reading", readingCount: ev.count, statusText: `Reading ${plural(ev.count, "source")}…` };
    case "notes":
      return { ...t, notes: ev.notes };
    case "answer_delta":
      return { ...t, phase: "answering", statusText: "Writing the answer…", answer: t.answer + ev.text };
    case "answer_replaced":
      // A repaired or cleaned-up answer replaces the text; old underlines no longer apply.
      return { ...t, answer: ev.text, claims: ev.reason === "repaired" ? t.claims : [] };
    case "verifying":
      // The count isn't known until verify reports it.
      return { ...t, phase: "verifying", statusText: "Checking claims…" };
    case "verdicts": {
      const n = ev.claims.filter((c) => c.verdict !== "meta").length;
      const bad = ev.claims.filter((c) => c.verdict === "unsupported").length;
      return bad && t.phase === "verifying"
        ? { ...t, claims: ev.claims, phase: "repairing", statusText: `Checked ${plural(n, "claim")} · fixing ${plural(bad, "sentence")}…` }
        : { ...t, claims: ev.claims, statusText: `Checked ${plural(n, "claim")}` };
    }
    case "done": {
      const r = ev.receipts;
      return {
        ...t,
        status: "done",
        phase: "finished",
        receipts: r,
        answer: r.answer,
        claims: r.claims,
        ...(r.studyNotes ? { notes: r.studyNotes } : {}),
        resolvedCategory: r.categoryId,
        statusText: doneSummary(r),
      };
    }
    case "error":
      return t.answer.trim()
        ? { ...t, unverified: "Verification didn't finish, so this answer hasn't been checked." }
        : { ...t, error: ev.message || "Something went wrong while answering." };
  }
}

export function doneSummary(r: Receipts): string {
  const read = r.sources.filter((s) => s.readStatus === "full").length;
  const parts = [`Searched ${plural(r.queries.length, "query", "queries")}`, `read ${plural(read, "page")}`, `${(r.timingsMs.total / 1000).toFixed(1)}s`];
  return parts.join(" · ");
}

/** The stream ended (normally, by error, or because the user pressed Stop). */
export function finishTurn(t: Turn, how: "ended" | "stopped" | "failed", message?: string): Turn {
  if (t.status === "done") return t;
  const hasAnswer = t.answer.trim().length > 0;
  if (how === "stopped") {
    return { ...t, status: "stopped", phase: "finished", statusText: "Stopped.", ...(hasAnswer ? { unverified: "Stopped before verification finished, so this answer hasn't been checked." } : {}) };
  }
  if (hasAnswer) {
    return { ...t, status: "failed", phase: "finished", statusText: "Connection ended early.", unverified: t.unverified ?? "Verification didn't finish, so this answer hasn't been checked." };
  }
  return { ...t, status: "failed", phase: "finished", statusText: "", error: t.error ?? message ?? "Something went wrong while answering. Please try again." };
}

/** Turns to send as `history`: finished ones with an answer, last 6. */
export function historyFor(turns: Turn[]): { question: string; answer: string }[] {
  return turns
    .filter((t) => t.status !== "running" && t.answer.trim() && !t.error)
    .slice(-6)
    .map((t) => ({ question: t.question, answer: t.answer }));
}

// ---------------------------------------------------------------- source labels

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthYear(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * A short publisher name. Agencies and institutions with a short name on .gov/.int/.org/.edu/.uk
 * become an acronym (cdc.gov → CDC, who.int → WHO). Otherwise the last " | " segment of the title
 * when it's short and complete, else the domain.
 */
export function sourceName(s: Pick<SourceSummary, "title" | "domain">): string {
  const labels = s.domain.split(".");
  const root = labels.length >= 2 ? labels[labels.length - 2]! : s.domain;
  const tld = labels.at(-1)!;
  if (/^(gov|int|org|edu|uk)$/.test(tld) && /^[a-z]{2,4}$/.test(root) && root !== "co") return root.toUpperCase();
  const parts = s.title.split(/\s+[|–—-]\s+/).map((p) => p.trim()).filter(Boolean);
  const last = parts.length > 1 ? parts.at(-1)! : "";
  return last && last.length <= 24 && !/\.\.\.|…|\(fixture\)/.test(last) ? last : s.domain;
}

/** Accessible label for a citation chip, e.g. "Source 3: CDC, September 2026". */
export function citationLabel(id: number, s?: Pick<SourceSummary, "title" | "domain" | "published">): string {
  if (!s) return `Source ${id}`;
  const when = monthYear(s.published);
  return `Source ${id}: ${sourceName(s)}${when ? `, ${when}` : ", undated"}`;
}

export const VERDICT_TEXT: Record<Claim["verdict"], string> = {
  supported: "Supported by the cited source",
  partial: "Partly supported",
  unsupported: "Not supported by the cited source",
  meta: "About the sources, not checked",
};
