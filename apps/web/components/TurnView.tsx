"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { Claim, Receipts, SourceSummary, StudyNotes } from "@studyhall/core";
import type { PublicCategory } from "../lib/categories";
import { renderBlocks, type Atom } from "../lib/client/render";
import { citationLabel, monthYear, VERDICT_TEXT, type Turn } from "../lib/client/turn";

type OpenReceipts = (sourceId: number | undefined, opener: HTMLElement | null) => void;

export function TurnView({ turn, categories, onOpenReceipts }: { turn: Turn; categories: PublicCategory[]; onOpenReceipts: OpenReceipts }) {
  const running = turn.status === "running";
  const answered = turn.answer.trim().length > 0;
  const resolved = turn.categoryId === "auto" && turn.resolvedCategory ? categories.find((c) => c.id === turn.resolvedCategory) : undefined;

  return (
    <article className="turn" aria-label={`Question: ${turn.question}`}>
      <div className="user-bubble">
        {turn.question}
        {turn.appLabel && <span className="app-tag">{turn.appLabel}</span>}
      </div>

      <div className="status-line" role="status" aria-live="polite">
        {running && <span className="dot" aria-hidden="true" />}
        <span>
          {resolved && <>Filed under {resolved.name} · </>}
          {turn.statusText}
        </span>
      </div>

      {turn.error ? (
        <p className="turn-error" role="alert">
          {turn.error}
        </p>
      ) : (
        <>
          <NotesSlot turn={turn} />
          <AnswerText turn={turn} onCite={onOpenReceipts} />
          {(answered || running) && <AnswerFooter turn={turn} onOpenReceipts={onOpenReceipts} />}
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- study notes

/**
 * The slot is reserved from the start so nothing jumps: a slim bar ("Taking notes…") that becomes a
 * one-line summary when notes arrive. Expanding it is the reader's choice.
 */
function NotesSlot({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const notes = turn.notes;
  const finished = turn.status !== "running";

  if (!notes) {
    const label = finished
      ? turn.receipts?.outcome === "answered" || !turn.receipts
        ? "No study notes for this answer"
        : "No study notes: Studyhall didn't answer this one"
      : "Taking notes…";
    return (
      <div className="notes">
        <div className="notes-bar" aria-live="off">
          {!finished && <span className="dot" aria-hidden="true" />}
          <span>{label}</span>
        </div>
      </div>
    );
  }

  const counts = [
    `${notes.keyPoints.length} key point${notes.keyPoints.length === 1 ? "" : "s"}`,
    ...(notes.conflicts.length ? [`${notes.conflicts.length} conflict${notes.conflicts.length === 1 ? "" : "s"}`] : []),
    ...(notes.mayBeStale.length ? [`${notes.mayBeStale.length} may be out of date`] : []),
  ];
  return (
    <div className="notes">
      <button type="button" className="notes-bar" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
        <span>Study notes</span>
        <span className="count">· {counts.join(" · ")}</span>
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="notes-body" id={bodyId}>
          <p className="notes-focus">{notes.focus}</p>
          <NoteList title="Key points" items={notes.keyPoints} />
          <NoteList title="Conflicts" items={notes.conflicts} />
          <NoteList title="May be out of date" items={notes.mayBeStale} />
        </div>
      )}
    </div>
  );
}

function NoteList({ title, items }: { title: string; items: StudyNotes["keyPoints"] }) {
  if (!items.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul>
        {items.map((i, n) => (
          <li key={n}>
            {i.text} <span className="sr-only">Sources</span>
            <span aria-hidden="true">[{i.sourceIds.join(", ")}]</span>
            <span className="sr-only">{i.sourceIds.join(", ")}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- answer text

function AnswerText({ turn, onCite }: { turn: Turn; onCite: OpenReceipts }) {
  if (!turn.answer) return null;
  const blocks = renderBlocks(turn.answer, turn.claims);
  const sources = turn.receipts?.sources ?? turn.sources;
  const byId = new Map<number, Pick<SourceSummary, "title" | "domain" | "published">>(sources.map((s) => [s.id, s]));
  const render = (atoms: Atom[], key: string) => <Inline key={key} atoms={atoms} claims={turn.claims} turnAnswer={turn.answer} sources={byId} onCite={onCite} />;
  return (
    <div className="answer" lang="en">
      {blocks.map((b, i) =>
        b.kind === "code" ? (
          <CodeBlock key={i} lang={b.lang} code={b.code} checks={turn.claims.filter((c) => c.kind === "code" && c.span && c.span.start >= b.start && c.span.end <= b.end)} />
        ) : b.kind === "p" ? (
          <p key={i}>{render(b.items[0]!, `${i}`)}</p>
        ) : b.kind === "ul" ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{render(it, `${i}-${j}`)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{render(it, `${i}-${j}`)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}

function Inline({
  atoms,
  claims,
  turnAnswer,
  sources,
  onCite,
}: {
  atoms: Atom[];
  claims: Claim[];
  turnAnswer: string;
  sources: Map<number, Pick<SourceSummary, "title" | "domain" | "published">>;
  onCite: OpenReceipts;
}) {
  // Claim indexes refer to the claims that are valid for this text (see renderBlocks/validClaims).
  const valid = claims.filter((c) => c.span && c.span.end <= turnAnswer.length && turnAnswer.slice(c.span.start, c.span.end) === c.text);
  const out: ReactNode[] = [];
  let group: ReactNode[] = [];
  let groupClaim = -1;
  const flush = (k: string) => {
    if (!group.length) return;
    const claim = groupClaim >= 0 ? valid[groupClaim] : undefined;
    out.push(claim && (claim.verdict === "partial" || claim.verdict === "unsupported") ? <ClaimSpan key={k} claim={claim}>{group}</ClaimSpan> : <span key={k}>{group}</span>);
    group = [];
  };
  atoms.forEach((a, i) => {
    if (a.claim !== groupClaim) {
      flush(`g${i}`);
      groupClaim = a.claim;
    }
    group.push(a.kind === "text" ? a.text : <Cite key={`c${i}`} id={a.id} source={sources.get(a.id)} onCite={onCite} />);
  });
  flush("end");
  return <>{out}</>;
}

function Cite({ id, source, onCite }: { id: number; source?: Pick<SourceSummary, "title" | "domain" | "published">; onCite: OpenReceipts }) {
  const tipId = useId();
  const label = citationLabel(id, source);
  return (
    <span className="cite-wrap">
      <button type="button" className="cite" aria-label={label} aria-describedby={tipId} onClick={(e) => onCite(id, e.currentTarget)}>
        {id}
      </button>
      <span className="tip" role="tooltip" id={tipId}>
        {source ? (
          <>
            <strong>{source.title}</strong>
            {source.domain} · {monthYear(source.published) ?? "undated"}
          </>
        ) : (
          `Source ${id}`
        )}
      </span>
    </span>
  );
}

/** Partial and unsupported sentences: an underline plus a text reason (never color alone). */
function ClaimSpan({ claim, children }: { claim: Claim; children: ReactNode }) {
  const tipId = useId();
  const reason = `${VERDICT_TEXT[claim.verdict]}${claim.note ? `: ${claim.note}` : "."}`;
  return (
    <span className="claim-wrap">
      <span className={`claim claim-${claim.verdict}`} tabIndex={0} aria-describedby={tipId}>
        {children}
      </span>
      <span className="tip" role="tooltip" id={tipId}>
        {reason}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- code

/** Code from the answer, with a copy button and the result of checking each function against the sources. */
function CodeBlock({ lang, code, checks }: { lang: string; code: string; checks: Claim[] }) {
  const [copied, setCopied] = useState(false);
  const names = [...new Map(checks.map((c) => [c.text, c])).values()];
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang || "code"}</span>
        <button
          type="button"
          className="copy-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Code copied" : ""}
        </span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
      {names.length > 0 && (
        <ul className="code-checks" aria-label="Functions checked against the sources">
          {names.map((c) => (
            <li key={c.text} className={c.verdict === "supported" ? "ok" : "warn"}>
              <span aria-hidden="true">{c.verdict === "supported" ? "✓" : "~"}</span> <code>{c.text}</code>{" "}
              {c.verdict === "supported" ? `in source ${c.sourceIds.join(", ")}` : c.note.replace(/\.$/, "").toLowerCase()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- footer

const OUTCOME_LABEL: Record<Receipts["outcome"], string> = {
  answered: "",
  refused: "Declined",
  insufficient_sources: "Not enough sources",
  no_results: "Couldn't verify",
  error: "Error",
};

function formatAsOf(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function AnswerFooter({ turn, onOpenReceipts }: { turn: Turn; onOpenReceipts: OpenReceipts }) {
  const r = turn.receipts;
  let content: ReactNode = null;

  if (turn.unverified) {
    content = (
      <span className="unverified fade-in" role="note">
        {turn.unverified}
      </span>
    );
  } else if (r) {
    const label = r.outcome === "answered" ? `${r.confidence[0]!.toUpperCase()}${r.confidence.slice(1)} confidence` : OUTCOME_LABEL[r.outcome];
    const cls = r.outcome === "answered" ? `badge-${r.confidence}` : "badge-off";
    content = (
      <span className="fade-in" style={{ display: "contents" }}>
        <span className={`badge ${cls}`} title={r.confidenceReasons.join(" ")}>
          {label}
        </span>
        <span>As of {formatAsOf(r.asOf)}</span>
        {r.newestSourceAge && <span>Newest source: {r.newestSourceAge}</span>}
        <button type="button" className="link-button" onClick={(e) => onOpenReceipts(undefined, e.currentTarget)}>
          Receipts
        </button>
      </span>
    );
  } else if (turn.phase === "verifying" || turn.phase === "repairing") {
    content = (
      <>
        <span className="dot" aria-hidden="true" />
        <span>{turn.statusText}</span>
      </>
    );
  }
  // The footer row is always reserved, so the badge appears without moving anything.
  return <div className="answer-footer">{content}</div>;
}
