"use client";

import { useEffect, useRef } from "react";
import { STATUS_LABEL, STATUS_MEANING, type CodeRun } from "../lib/client/code";
import { monthYear } from "../lib/client/turn";

const STEP_LABEL: Record<string, string> = {
  release: "Look up the current release",
  search: "Search the official docs (slowest call)",
  read: "Read docs pages (slowest call)",
  judge: "Check each call (slowest call)",
  rewrite: "Write the corrected lines",
};

/** Receipts for a code check: the same panel as answers and claim checks. */
export function CodeReceiptsDrawer({ run, targetSourceId, onClose }: { run: CodeRun; targetSourceId?: number; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const r = run.receipts;

  useEffect(() => {
    closeBtn.current?.focus();
    if (targetSourceId !== undefined) document.getElementById(`code-source-${run.id}-${targetSourceId}`)?.scrollIntoView({ block: "center" });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, targetSourceId, run.id]);

  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={`code-receipts-${run.id}`} ref={panel}>
        <div className="drawer-head">
          <h2 id={`code-receipts-${run.id}`}>Receipts</h2>
          <button type="button" className="icon-button" onClick={onClose} ref={closeBtn} aria-label="Close receipts">
            ×
          </button>
        </div>
        <div className="drawer-body">
          {!r && <p className="r-meta">Receipts are complete once every call has been checked.</p>}
          {r && (
            <section aria-labelledby={`cd-sum-${run.id}`}>
              <h3 id={`cd-sum-${run.id}`}>Result</h3>
              <p style={{ margin: 0 }}>
                <strong>{r.summary}.</strong> {r.scope}
              </p>
              <p className="r-meta" style={{ display: "block", marginTop: 6 }}>
                {r.app} {r.release}
                {r.releaseSource.kind === "lookup" && r.releaseSource.url ? (
                  <>
                    {" "}
                    · current release found on{" "}
                    <a href={r.releaseSource.url} target="_blank" rel="noreferrer noopener">
                      {r.releaseSource.title ?? r.releaseSource.url}
                    </a>
                  </>
                ) : r.releaseSource.kind === "user" ? " · release you chose" : " · current release unknown"}
              </p>
            </section>
          )}
          {run.calls.length > 0 && (
            <section aria-labelledby={`cd-calls-${run.id}`}>
              <h3 id={`cd-calls-${run.id}`}>API calls</h3>
              <ul>
                {run.calls.map((c) => (
                  <li key={c.name} className="r-claim">
                    <span className={`verdict verdict-${c.result?.status === "current" ? "supported" : c.result?.status === "deprecated" || c.result?.status === "removed" ? "unsupported" : "meta"}`}>
                      {c.result ? STATUS_LABEL[c.result.status] : "Checking"}
                    </span>
                    <span>
                      <code>{c.name}</code> (lines {c.lines.join(", ")})
                    </span>
                    <span className="why">
                      {c.result ? `${STATUS_MEANING[c.result.status]}${c.result.note ? ` ${c.result.note}` : ""}` : ""}
                      {c.result?.query ? ` Searched: “${c.result.query}”.` : ""}
                      {c.result?.sourceIds.length ? ` Sources ${c.result.sourceIds.join(", ")}.` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {r && r.sources.length > 0 && (
            <section aria-labelledby={`cd-src-${run.id}`}>
              <h3 id={`cd-src-${run.id}`}>Official docs</h3>
              <ol>
                {r.sources.map((s) => (
                  <li key={s.id} id={`code-source-${run.id}-${s.id}`} className={`r-source${s.id === targetSourceId ? " targeted" : ""}`}>
                    <div>
                      [{s.id}]{" "}
                      <a href={s.url} target="_blank" rel="noreferrer noopener">
                        {s.title}
                      </a>
                    </div>
                    <div className="r-meta">
                      <span>{s.domain}</span>
                      <span>{monthYear(s.published) ?? "Undated"}</span>
                      <span className="tag">{s.readStatus === "full" ? "Full page read" : "Snippets only"}</span>
                      {s.cited && <span className="tag">Cited</span>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {r && r.warnings.length > 0 && (
            <section aria-labelledby={`cd-warn-${run.id}`}>
              <h3 id={`cd-warn-${run.id}`}>Warnings</h3>
              <ul className="r-meta" style={{ display: "block" }}>
                {r.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}
          {r && (
            <section aria-labelledby={`cd-time-${run.id}`}>
              <h3 id={`cd-time-${run.id}`}>Calls and timings</h3>
              <dl className="kv">
                {Object.entries(r.timingsMs)
                  .filter(([k]) => k !== "total")
                  .map(([k, ms]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{STEP_LABEL[k] ?? k}</dt>
                      <dd>{(ms / 1000).toFixed(1)}s</dd>
                    </div>
                  ))}
                <dt>Total</dt>
                <dd>{(r.timingsMs.total / 1000).toFixed(1)}s</dd>
                <dt>You.com</dt>
                <dd>
                  {r.usage.you.searches} searches · {r.usage.you.contentsPages} pages read
                </dd>
              </dl>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
