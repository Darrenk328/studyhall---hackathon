"use client";

import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiCall, CallStatus, CodeCheckEvent, CodeLang, SourceSummary } from "@studyhall/core";
import {
  applyCodeEvent,
  CODE_EXAMPLES,
  finishCodeRun,
  LANG_LABEL,
  loadCodeRuns,
  MAX_CODE_CHARS,
  MAX_CODE_LINES,
  newCodeRun,
  saveCodeRuns,
  STATUS_LABEL,
  STATUS_MEANING,
  type CallCard,
  type CodeRun,
} from "../lib/client/code";
import { findCodeRecording, replay, type CodeRecording, type DemoSet } from "../lib/client/demo";
import { errorMessage, readSse } from "../lib/client/sse";
import { monthYear } from "../lib/client/turn";
import { CategoryIcon } from "./CategoryIcon";
import { CodeReceiptsDrawer } from "./CodeReceiptsDrawer";

const ICON: Record<CallStatus, typeof CircleCheck> = { current: CircleCheck, deprecated: TriangleAlert, removed: CircleX, not_found: CircleHelp, unverifiable: CircleHelp };

/** "Ask a question" / "Check my code", shown in the Engineering Software header. */
export function EngineeringModes({ mode }: { mode: "ask" | "code" }) {
  return (
    <nav className="mode-switch" aria-label="Engineering Software modes">
      <a href="#engineering" aria-current={mode === "ask" ? "page" : undefined}>
        Ask a question
      </a>
      <a href="#code" aria-current={mode === "code" ? "page" : undefined}>
        Check my code
      </a>
    </nav>
  );
}

function StatusPill({ card }: { card: CallCard }) {
  const s = card.result?.status;
  if (!s)
    return (
      <span className="verdict-pill pill-pending">
        <span className="dot" aria-hidden="true" />
        {card.phase === "reading" ? "Reading the docs…" : card.phase === "judging" ? "Checking…" : card.phase ? "Searching the docs…" : "Waiting…"}
      </span>
    );
  const Icon = ICON[s];
  const cls = s === "current" ? "supported" : s === "deprecated" || s === "removed" ? "contradicted" : "unverifiable";
  return (
    <span className={`verdict-pill pill-${cls}`} title={STATUS_MEANING[s]}>
      <Icon size={15} strokeWidth={2} aria-hidden="true" focusable="false" />
      {STATUS_LABEL[s]}
    </span>
  );
}

function CallCardView({ card, sources, onCite }: { card: CallCard; sources: Map<number, SourceSummary>; onCite: (id: number, el: HTMLElement) => void }) {
  const r = card.result;
  const verdict = !r ? "pending" : r.status === "current" ? "supported" : r.status === "deprecated" || r.status === "removed" ? "contradicted" : "unverifiable";
  return (
    <li className="claim-card" data-verdict={verdict}>
      <div className="claim-card-head">
        <StatusPill card={card} />
        <span className="claim-cat">
          {card.kind} · line{card.lines.length === 1 ? "" : "s"} {card.lines.join(", ")}
        </span>
        {r && <span className="sr-only">{STATUS_MEANING[r.status]}</span>}
      </div>
      <p className="claim-card-text">
        <code>{card.name}</code>
      </p>
      {r && (
        <div className="claim-card-body fade-in">
          {r.replacement && (
            <p className="claim-instead">
              <strong>Use instead:</strong> <code>{r.replacement}</code>
            </p>
          )}
          {r.evidence && <p className="claim-evidence">{r.evidence}</p>}
          {r.sourceIds.length > 0 && (
            <ul className="cited-sources" aria-label={`Docs for ${card.name}`}>
              {r.sourceIds.map((id) => {
                const src = sources.get(id);
                return src ? (
                  <li key={id}>
                    <button type="button" className="cited-source" onClick={(e) => onCite(id, e.currentTarget)} title={src.title}>
                      <span className="cited-num">{id}</span>
                      <span className="cited-domain">{src.domain}</span>
                      <span className="cited-date">{monthYear(src.published) ?? "undated"}</span>
                    </button>
                  </li>
                ) : null;
              })}
            </ul>
          )}
          {r.sourceQuote && <blockquote className="claim-quote">“{r.sourceQuote}”</blockquote>}
          {r.note && <p className="claim-note">{r.note}</p>}
        </div>
      )}
    </li>
  );
}

function CodeDiff({ run, onCite }: { run: CodeRun; onCite: (id: number, el: HTMLElement) => void }) {
  const [copied, setCopied] = useState(false);
  const rec = run.receipts;
  if (!rec || !rec.edits.length) return null;
  return (
    <section className="corrected" aria-labelledby={`code-fix-${run.id}`}>
      <h3 id={`code-fix-${run.id}`}>Corrected code</h3>
      <p className="corrected-note">Only lines using a flagged call changed, each to the replacement the official docs name. Review before running.</p>
      <ol className="code-diff">
        {rec.edits.map((e) => (
          <li key={e.line}>
            <div className="diff-line diff-del">
              <span className="diff-n" aria-label={`Line ${e.line}, before`}>
                {e.line} −
              </span>
              <code>{e.original}</code>
            </div>
            <div className="diff-line diff-add">
              <span className="diff-n" aria-label={`Line ${e.line}, after`}>
                {e.line} +
              </span>
              <code>{e.corrected}</code>
            </div>
            <div className="diff-why">
              Replaces <code>{e.call}</code>, per
              {e.sourceIds.map((id) => (
                <button key={id} type="button" className="cite" onClick={(ev) => onCite(id, ev.currentTarget)} aria-label={`Source ${id}`}>
                  {id}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
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
        {copied ? "Copied" : "Copy corrected code"}
      </button>
    </section>
  );
}

function CodeRunView({ run, onOpenReceipts }: { run: CodeRun; onOpenReceipts: (sourceId: number | undefined, el: HTMLElement) => void }) {
  const [open, setOpen] = useState(false);
  const sources = new Map<number, SourceSummary>((run.receipts?.sources ?? []).map((s) => [s.id, s]));
  const lines = run.code.split("\n");
  return (
    <article className="turn check-run" aria-label="Code check">
      <div className="user-bubble code-pasted">
        <span className="check-pasted-label">
          Code to check{run.lang ? ` · ${LANG_LABEL[run.lang]}` : ""}
        </span>
        <pre tabIndex={0} aria-label="Code to check">
          <code>{lines.length > 8 && !open ? `${lines.slice(0, 8).join("\n")}\n…` : run.code}</code>
        </pre>
        {lines.length > 8 && (
          <button type="button" className="link-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Show less" : `Show all ${lines.length} lines`}
          </button>
        )}
      </div>
      {run.replayOf && <p className="replay-tag">Replay of a live check recorded {new Date(run.replayOf).toLocaleString(undefined, { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
      {run.release && (
        <p className="release-line">
          Checking against <strong>{run.app} {run.release}</strong>
          {run.releaseSource?.kind === "lookup" && run.releaseSource.url ? (
            <>
              {" "}
              (current release, from{" "}
              <a href={run.releaseSource.url} target="_blank" rel="noreferrer noopener">
                {new URL(run.releaseSource.url).hostname.replace(/^www\./, "")}
              </a>
              )
            </>
          ) : run.releaseSource?.kind === "user" ? " (release you chose)" : null}
        </p>
      )}
      {run.statusText && (
        <div className="status-line" aria-live="polite">
          {run.status === "running" && <span className="dot" aria-hidden="true" />}
          {run.statusText}
        </div>
      )}
      {run.error && (
        <div className="turn-error" role="alert">
          {run.error}
        </div>
      )}
      {run.message && <p className="check-message">{run.message}</p>}
      {run.calls.length > 0 && (
        <ol className="claim-cards" aria-label="API calls">
          {run.calls.map((c) => (
            <CallCardView key={c.name} card={c} sources={sources} onCite={(id, el) => onOpenReceipts(id, el)} />
          ))}
        </ol>
      )}
      <CodeDiff run={run} onCite={(id, el) => onOpenReceipts(id, el)} />
      {run.receipts?.outcome === "checked" && (
        <div className="answer-footer">
          <button type="button" className="link-button" onClick={(e) => onOpenReceipts(undefined, e.currentTarget)}>
            Receipts
          </button>
          <span>Checked against the web at {new Date(run.receipts.asOf).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <span>
            {run.receipts.usage.you.searches} searches · {run.receipts.sources.filter((s) => s.readStatus === "full").length} docs pages read
          </span>
        </div>
      )}
    </article>
  );
}

/** "Check my code": checks each API call in pasted code against the vendor's official docs for a release. */
export function CodeCheckView({ demo, speed, pending, onPendingDone }: { demo: DemoSet | null; speed: number; pending: CodeRecording | null; onPendingDone: () => void }) {
  const [runs, setRuns] = useState<CodeRun[]>([]);
  const [draft, setDraft] = useState("");
  const [lang, setLang] = useState<CodeLang | "auto">("auto");
  const [release, setRelease] = useState("");
  const [preview, setPreview] = useState<{ lang: CodeLang; detected: boolean; calls: ApiCall[] } | null>(null);
  const [running, setRunning] = useState<AbortController | null>(null);
  const [drawer, setDrawer] = useState<{ runId: string; sourceId?: number; opener: HTMLElement | null } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => setRuns(loadCodeRuns()), []);

  // The call list is parsed locally on the server (no model, no search), so it shows before any check runs.
  useEffect(() => {
    if (!draft.trim()) {
      setPreview(null);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/code-parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: draft, ...(lang !== "auto" ? { lang } : {}) }), signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setPreview(d))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [draft, lang]);

  const update = useCallback((id: string, fn: (r: CodeRun) => CodeRun) => {
    setRuns((prev) => {
      const next = prev.map((r) => (r.id === id ? fn(r) : r));
      saveCodeRuns(next);
      return next;
    });
  }, []);

  const run = useCallback(
    async (code: string, opts: { lang?: CodeLang; release?: string; recording?: CodeRecording } = {}) => {
      if (!code.trim() || running) return;
      const rec = opts.recording ?? findCodeRecording(demo, code);
      const r = { ...newCodeRun(code), ...(rec ? { replayOf: rec.recordedAt } : {}) };
      setRuns((prev) => {
        const next = [...prev, r];
        saveCodeRuns(next);
        return next;
      });
      setDraft("");
      const controller = new AbortController();
      setRunning(controller);
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
      try {
        if (rec) {
          for await (const ev of replay<CodeCheckEvent>(rec, controller.signal, speed)) update(r.id, (x) => applyCodeEvent(x, ev));
          update(r.id, (x) => finishCodeRun(x, "ended"));
          return;
        }
        const res = await fetch("/api/code-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, ...(opts.lang ? { lang: opts.lang } : {}), ...(opts.release ? { release: opts.release } : {}) }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const message = await errorMessage(res);
          update(r.id, (x) => finishCodeRun(x, "failed", message));
          return;
        }
        for await (const ev of readSse<CodeCheckEvent>(res.body)) update(r.id, (x) => applyCodeEvent(x, ev));
        update(r.id, (x) => finishCodeRun(x, "ended"));
      } catch (err) {
        const stopped = controller.signal.aborted;
        update(r.id, (x) => finishCodeRun(x, stopped ? "stopped" : "failed", stopped ? undefined : "The connection dropped. Please try again."));
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
    void run(pending.question, { recording: pending });
  }, [pending, running, run, onPendingDone]);

  const lineCount = draft ? draft.split("\n").length : 0;
  const tooLong = lineCount > MAX_CODE_LINES || draft.length > MAX_CODE_CHARS;
  const canCheck = draft.trim().length > 0 && !running && !tooLong;
  const drawerRun = drawer ? runs.find((r) => r.id === drawer.runId) : undefined;

  return (
    <>
      <header className="cat-header">
        <h1>
          <CategoryIcon name="wrench" size={19} />
          Engineering Software
        </h1>
        <EngineeringModes mode="code" />
        <p>Paste MATLAB, Fusion (Python API) or Inventor iLogic code. Studyhall lists the API calls, then checks each one against the vendor&apos;s official docs for the current release.</p>
        <p className="safety-note">Checks API usage against the docs. It doesn&apos;t run your code or test its behavior; review any change before running it.</p>
      </header>

      <div className="conversation">
        {runs.length === 0 ? (
          <section className="empty" aria-labelledby="code-try-heading">
            <h2 id="code-try-heading">Try one of these</h2>
            <div className="starters">
              {CODE_EXAMPLES.map((ex) => (
                <button key={ex.label} type="button" className="starter" onClick={() => run(ex.code, { lang: ex.lang })} disabled={Boolean(running)}>
                  {ex.label} <span className="claim-cat">({ex.expect})</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          runs.map((r) => <CodeRunView key={r.id} run={r} onOpenReceipts={(sourceId, opener) => setDrawer({ runId: r.id, ...(sourceId !== undefined ? { sourceId } : {}), opener })} />)
        )}
        <div ref={bottom} />
      </div>

      <div className="composer-wrap">
        {preview && preview.calls.length > 0 && (
          <div className="calls-preview" aria-live="polite">
            <strong>
              {preview.calls.length} API call{preview.calls.length === 1 ? "" : "s"} to check
            </strong>{" "}
            ({LANG_LABEL[preview.lang]}
            {preview.detected ? ", detected" : ""}):{" "}
            {preview.calls.map((c, i) => (
              <span key={c.name}>
                {i > 0 ? ", " : ""}
                <code>{c.name}</code>
              </span>
            ))}
          </div>
        )}
        <form
          className="composer code-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (running) running.abort();
            else if (canCheck) void run(draft, { ...(lang !== "auto" ? { lang } : {}), ...(release.trim() ? { release: release.trim() } : {}) });
          }}
        >
          <label htmlFor="code-input" className="sr-only">
            Code to check
          </label>
          <textarea id="code-input" rows={5} value={draft} spellCheck={false} placeholder="Paste AI-written MATLAB, Fusion Python or iLogic code…" onChange={(e) => setDraft(e.target.value)} />
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
        <div className="composer-meta code-meta">
          <label>
            Language{" "}
            <select value={lang} onChange={(e) => setLang(e.target.value as CodeLang | "auto")}>
              <option value="auto">Detect automatically</option>
              <option value="matlab">{LANG_LABEL.matlab}</option>
              <option value="fusion">{LANG_LABEL.fusion}</option>
              <option value="ilogic">{LANG_LABEL.ilogic}</option>
            </select>
          </label>
          <label>
            Release{" "}
            <input type="text" value={release} maxLength={40} placeholder="current (looked up)" onChange={(e) => setRelease(e.target.value)} />
          </label>
          <span aria-live="polite" className={tooLong ? "unverified" : undefined}>
            {lineCount} / {MAX_CODE_LINES} lines
          </span>
        </div>
      </div>

      {drawer && drawerRun && (
        <CodeReceiptsDrawer
          run={drawerRun}
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
