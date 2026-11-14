"use client";

import { CircleCheck, CircleHelp, CircleX, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CheckEvent, ClaimVerdict, SourceSummary } from "@studyhall/core";
import type { PublicCategory } from "../lib/categories";
import {
  applyCheckEvent,
  correctedSegments,
  finishCheckRun,
  loadCheckRuns,
  MAX_CHECK_CHARS,
  newCheckRun,
  PHASE_TEXT,
  saveCheckRuns,
  VERDICT_LABEL,
  VERDICT_MEANING,
  type CheckRun,
  type ClaimCard,
} from "../lib/client/check";
import { findCheckRecording, replay, type CheckRecording, type DemoSet } from "../lib/client/demo";
import { errorMessage, readSse } from "../lib/client/sse";
import { citationLabel } from "../lib/client/turn";
import { CheckReceiptsDrawer } from "./CheckReceiptsDrawer";

export const CHECK_ID = "check";

/** Examples for the empty state. The first is the bare model's real (wrong) answer from the Nov 13 eval. */
export const CHECK_EXAMPLES: { label: string; text: string }[] = [
  {
    label: "An AI's answer about the UK ETA fee",
    text: 'As of my latest knowledge, the UK ETA costs **£16 per person**. It rose from £10 to £16 on 9 April 2025, and I can\'t confirm whether it has changed since then, so check the official GOV.UK page or the "UK ETA" app before you pay.\n\nApply only through GOV.UK or the official app, because third-party sites charge extra fees. The ETA is valid for multiple visits over two years (or until your passport expires) and generally allows stays of up to six months. Every traveller needs their own ETA, including children and infants.',
  },
  { label: "A claim about the farthest crewed flight", text: "Apollo 13 still holds the record for the farthest distance humans have traveled from Earth." },
];

const VERDICT_ICON: Record<ClaimVerdict, typeof CircleCheck> = { supported: CircleCheck, contradicted: CircleX, unverifiable: CircleHelp };

function VerdictPill({ card }: { card: ClaimCard }) {
  const v = card.result?.verdict;
  if (!v) {
    return (
      <span className="verdict-pill pill-pending">
        <span className="dot" aria-hidden="true" />
        {card.phase ? PHASE_TEXT[card.phase] : "Waiting…"}
      </span>
    );
  }
  const Icon = VERDICT_ICON[v];
  return (
    <span className={`verdict-pill pill-${v}`} title={VERDICT_MEANING[v]}>
      <Icon size={15} strokeWidth={2} aria-hidden="true" focusable="false" />
      {VERDICT_LABEL[v]}
    </span>
  );
}

function ClaimCardView({
  card,
  sources,
  categoryName,
  onCite,
}: {
  card: ClaimCard;
  sources: Map<number, SourceSummary>;
  categoryName?: string;
  onCite: (id: number, el: HTMLElement) => void;
}) {
  const r = card.result;
  return (
    <li className="claim-card" data-verdict={r?.verdict ?? "pending"}>
      <div className="claim-card-head">
        <VerdictPill card={card} />
        {categoryName && <span className="claim-cat">{categoryName}</span>}
        {r && <span className="sr-only">{VERDICT_MEANING[r.verdict]}</span>}
      </div>
      <p className="claim-card-text">{card.text}</p>
      {r && (
        <div className="claim-card-body fade-in">
          {r.evidence && (
            <p className="claim-evidence">
              {r.evidence}
              {r.sourceIds.map((id) => (
                <button key={id} type="button" className="cite" aria-label={citationLabel(id, sources.get(id))} onClick={(e) => onCite(id, e.currentTarget)}>
                  {id}
                </button>
              ))}
            </p>
          )}
          {!r.evidence && r.sourceIds.length > 0 && (
            <p className="claim-evidence">
              Sources:
              {r.sourceIds.map((id) => (
                <button key={id} type="button" className="cite" aria-label={citationLabel(id, sources.get(id))} onClick={(e) => onCite(id, e.currentTarget)}>
                  {id}
                </button>
              ))}
            </p>
          )}
          {r.sourceQuote && <blockquote className="claim-quote">“{r.sourceQuote}”</blockquote>}
          {r.verdict === "contradicted" && r.sourcesSay && (
            <p className="claim-instead">
              <strong>Sources say instead:</strong> {r.sourcesSay}
            </p>
          )}
          {r.note && <p className="claim-note">{r.note}</p>}
        </div>
      )}
    </li>
  );
}

function CorrectedText({ run }: { run: CheckRun }) {
  const [copied, setCopied] = useState(false);
  const rec = run.receipts;
  if (!rec || !rec.edits.length) return null;
  return (
    <section className="corrected" aria-labelledby={`corrected-${run.id}`}>
      <h3 id={`corrected-${run.id}`}>Corrected text</h3>
      <p className="corrected-note">Only the contradicted parts changed. They&apos;re highlighted; hover or focus one to see the original.</p>
      <div className="corrected-text">
        {correctedSegments(rec).map((s, i) =>
          s.original !== undefined ? (
            <ins key={i} title={`Was: ${s.original}`} tabIndex={0}>
              <span className="sr-only">Corrected from “{s.original}” to: </span>
              {s.text}
            </ins>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          void navigator.clipboard?.writeText(rec.corrected).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy corrected text"}
      </button>
    </section>
  );
}

function PastedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 320;
  return (
    <div className="user-bubble check-pasted">
      <span className="check-pasted-label">Text to check</span>
      <p>{long && !open ? `${text.slice(0, 300).trimEnd()}…` : text}</p>
      {long && (
        <button type="button" className="link-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

function CheckRunView({ run, categories, onOpenReceipts }: { run: CheckRun; categories: PublicCategory[]; onOpenReceipts: (sourceId: number | undefined, el: HTMLElement) => void }) {
  const sources = new Map<number, SourceSummary>((run.receipts?.sources ?? run.sources).map((s) => [s.id, s]));
  const catName = (id?: string) => (id ? categories.find((c) => c.id === id)?.name : undefined);
  const counts = run.receipts?.counts;
  return (
    <article className="turn check-run" aria-label="Claim check">
      <PastedText text={run.text} />
      {run.replayOf && (
        <p className="replay-tag">
          Replay of a live check recorded {new Date(run.replayOf).toLocaleString(undefined, { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
      {run.statusText && (
        <div className="status-line" aria-live="polite">
          {run.status === "running" && <span className="dot" aria-hidden="true" />}
          {counts && run.receipts?.outcome === "checked" ? (
            <span className="check-summary">
              <span className="sum-supported">{counts.supported} supported</span> · <span className="sum-contradicted">{counts.contradicted} contradicted</span> ·{" "}
              <span className="sum-unverifiable">{counts.unverifiable} unverifiable</span> · {(run.receipts.timingsMs.total / 1000).toFixed(1)}s
            </span>
          ) : (
            run.statusText
          )}
        </div>
      )}
      {run.error && (
        <div className="turn-error" role="alert">
          {run.error}
        </div>
      )}
      {run.message && <p className="check-message">{run.message}</p>}
      {run.receipts?.outcome === "search_unavailable" && (
        <p className="check-message">
          <a href="/?demo=1#check">Try the demo check instead</a>
        </p>
      )}
      {run.claims.length > 0 && (
        <ol className="claim-cards" aria-label="Claims">
          {run.claims.map((c) => (
            <ClaimCardView key={c.id} card={c} sources={sources} categoryName={catName(c.categoryId)} onCite={(id, el) => onOpenReceipts(id, el)} />
          ))}
        </ol>
      )}
      {run.skipped.length > 0 && (
        <details className="check-skipped">
          <summary>
            Skipped {run.skipped.length} {run.skipped.length === 1 ? "sentence" : "sentences"} with no checkable fact
          </summary>
          <ul>
            {run.skipped.map((s, i) => (
              <li key={i}>
                “{s.text}” <span className="why">({s.reason})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <CorrectedText run={run} />
      {run.receipts && run.receipts.outcome === "checked" && (
        <div className="answer-footer">
          <button type="button" className="link-button" onClick={(e) => onOpenReceipts(undefined, e.currentTarget)}>
            Receipts
          </button>
          <span>
            {run.receipts.sources.filter((s) => s.readStatus === "full").length} pages read · {run.receipts.usage.you.searches} searches
          </span>
        </div>
      )}
    </article>
  );
}

/** "Check a claim" mode: paste text, get a verdict per factual claim, with evidence and receipts. */
export function CheckView({
  categories,
  demo,
  speed,
  pending,
  onPendingDone,
}: {
  categories: PublicCategory[];
  demo: DemoSet | null;
  speed: number;
  /** A demo recording to replay as soon as this view is showing. */
  pending: CheckRecording | null;
  onPendingDone: () => void;
}) {
  const [runs, setRuns] = useState<CheckRun[]>([]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState<AbortController | null>(null);
  const [drawer, setDrawer] = useState<{ runId: string; sourceId?: number; opener: HTMLElement | null } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => setRuns(loadCheckRuns()), []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "";
    if (el.value) el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  const update = useCallback((id: string, fn: (r: CheckRun) => CheckRun) => {
    setRuns((prev) => {
      const next = prev.map((r) => (r.id === id ? fn(r) : r));
      saveCheckRuns(next);
      return next;
    });
  }, []);

  const check = useCallback(
    async (raw: string, recording?: CheckRecording) => {
      const text = raw.trim().slice(0, MAX_CHECK_CHARS);
      if (!text || running) return;
      const rec = recording ?? findCheckRecording(demo, text);
      const run = { ...newCheckRun(text), ...(rec ? { replayOf: rec.recordedAt } : {}) };
      setRuns((prev) => {
        const next = [...prev, run];
        saveCheckRuns(next);
        return next;
      });
      setDraft("");
      const controller = new AbortController();
      setRunning(controller);
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
      try {
        if (rec) {
          for await (const ev of replay<CheckEvent>(rec, controller.signal, speed)) update(run.id, (r) => applyCheckEvent(r, ev));
          update(run.id, (r) => finishCheckRun(r, "ended"));
          return;
        }
        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const message = await errorMessage(res);
          update(run.id, (r) => finishCheckRun(r, "failed", message));
          return;
        }
        for await (const ev of readSse<CheckEvent>(res.body)) update(run.id, (r) => applyCheckEvent(r, ev));
        update(run.id, (r) => finishCheckRun(r, "ended"));
      } catch (err) {
        const stopped = controller.signal.aborted;
        update(run.id, (r) => finishCheckRun(r, stopped ? "stopped" : "failed", stopped ? undefined : "The connection dropped. Please try again."));
        if (!stopped) console.error(err);
      } finally {
        setRunning(null);
      }
    },
    [running, demo, speed, update],
  );

  useEffect(() => {
    if (!pending || running) return;
    onPendingDone();
    void check(pending.question, pending);
  }, [pending, running, check, onPendingDone]);

  const drawerRun = drawer ? runs.find((r) => r.id === drawer.runId) : undefined;
  const canCheck = draft.trim().length > 0 && !running;

  return (
    <>
      <header className="cat-header">
        <h1>
          <ShieldCheck size={22} strokeWidth={1.75} aria-hidden="true" focusable="false" className="cat-icon" />
          Check a claim
        </h1>
        <p>Paste a claim or another AI&apos;s answer. Studyhall pulls out the factual claims, checks each one against the live web, and shows the evidence.</p>
      </header>

      <div className="conversation">
        {runs.length === 0 ? (
          <section className="empty" aria-labelledby="check-try-heading">
            <h2 id="check-try-heading">Try one of these</h2>
            <div className="starters">
              {CHECK_EXAMPLES.map((ex) => (
                <button key={ex.label} type="button" className="starter" onClick={() => check(ex.text)} disabled={Boolean(running)}>
                  {ex.label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          runs.map((r) => <CheckRunView key={r.id} run={r} categories={categories} onOpenReceipts={(sourceId, opener) => setDrawer({ runId: r.id, ...(sourceId !== undefined ? { sourceId } : {}), opener })} />)
        )}
        <div ref={bottom} />
      </div>

      <div className="composer-wrap">
        <form
          className="composer check-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (running) running.abort();
            else if (canCheck) void check(draft);
          }}
        >
          <label htmlFor="check-input" className="sr-only">
            Claim or text to check
          </label>
          <textarea
            id="check-input"
            ref={box}
            rows={2}
            maxLength={MAX_CHECK_CHARS}
            value={draft}
            placeholder="Paste a claim or an AI's answer to check…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (canCheck) void check(draft);
              }
            }}
            aria-describedby="check-hint"
          />
          {running ? (
            <button type="submit" className="ask stop">
              Stop
            </button>
          ) : (
            <button type="submit" className="ask" disabled={!canCheck}>
              Check
            </button>
          )}
        </form>
        <div className="composer-meta">
          <span id="check-hint">Up to 8 claims are checked. Ctrl+Enter or ⌘+Enter to check.</span>
          <span aria-live="polite">
            {draft.length.toLocaleString("en-US")} / {MAX_CHECK_CHARS.toLocaleString("en-US")}
          </span>
        </div>
      </div>

      {drawer && drawerRun && (
        <CheckReceiptsDrawer
          run={drawerRun}
          categories={categories}
          targetSourceId={drawer.sourceId}
          onClose={() => {
            const opener = drawer.opener;
            setDrawer(null);
            requestAnimationFrame(() => opener?.focus());
          }}
        />
      )}
    </>
  );
}
