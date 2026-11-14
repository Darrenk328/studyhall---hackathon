"use client";

import { useEffect, useRef } from "react";
import type { PublicCategory } from "../lib/categories";
import { VERDICT_LABEL, VERDICT_MEANING, type CheckRun } from "../lib/client/check";
import { monthYear } from "../lib/client/turn";

const STEP_LABEL: Record<string, string> = {
  extract: "Find the claims",
  search: "Pick topic, plan and search (all claims)",
  read: "Read pages (once each)",
  judge: "Check each claim",
};

const ROLE_LABEL: Record<string, string> = { extract: "Find claims", classify: "Pick topic", plan: "Plan searches", verify: "Check claims" };

/** Receipts for a claim check: the same panel as answers (right side on desktop, bottom sheet on mobile). */
export function CheckReceiptsDrawer({ run, categories, targetSourceId, onClose }: { run: CheckRun; categories: PublicCategory[]; targetSourceId?: number; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const r = run.receipts;
  const sources = r?.sources ?? run.sources.map((s) => ({ ...s, readStatus: undefined, readNote: undefined, cited: undefined }));
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  useEffect(() => {
    closeBtn.current?.focus();
    if (targetSourceId !== undefined) document.getElementById(`check-source-${run.id}-${targetSourceId}`)?.scrollIntoView({ block: "center" });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, targetSourceId, run.id]);

  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={`check-receipts-${run.id}`} ref={panel}>
        <div className="drawer-head">
          <h2 id={`check-receipts-${run.id}`}>Receipts</h2>
          <button type="button" className="icon-button" onClick={onClose} ref={closeBtn} aria-label="Close receipts">
            ×
          </button>
        </div>
        <div className="drawer-body">
          {!r && <p className="r-meta">Receipts are complete once every claim has been checked.</p>}
          {r && (
            <section aria-labelledby={`cr-sum-${run.id}`}>
              <h3 id={`cr-sum-${run.id}`}>Result</h3>
              <p style={{ margin: 0 }}>
                <strong>{r.summary}.</strong> Verdicts come only from the sources listed here: a claim the sources don&apos;t settle is unverifiable, never guessed.
              </p>
            </section>
          )}

          {run.claims.length > 0 && (
            <section aria-labelledby={`cr-claims-${run.id}`}>
              <h3 id={`cr-claims-${run.id}`}>Claims</h3>
              <ul>
                {run.claims.map((c) => (
                  <li key={c.id} className="r-claim">
                    <span className={`verdict verdict-${c.result?.verdict === "supported" ? "supported" : c.result?.verdict === "contradicted" ? "unsupported" : "meta"}`}>
                      {c.result ? VERDICT_LABEL[c.result.verdict] : "Checking"}
                    </span>
                    <span>{c.text}</span>
                    <span className="why">
                      {c.result ? `${VERDICT_MEANING[c.result.verdict]}${c.result.note ? ` ${c.result.note}` : ""}` : ""}
                      {c.categoryId ? ` Topic: ${catName(c.categoryId)}.` : ""}
                      {c.result?.queries.length ? ` Searched: ${c.result.queries.map((q) => `“${q}”`).join(", ")}.` : ""}
                      {c.result?.sourceIds.length ? ` Sources ${c.result.sourceIds.join(", ")}.` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sources.length > 0 && (
            <section aria-labelledby={`cr-sources-${run.id}`}>
              <h3 id={`cr-sources-${run.id}`}>Sources</h3>
              <p className="r-meta" style={{ display: "block", margin: "0 0 8px" }}>
                Found for all claims together; each page is read once.
              </p>
              <ol>
                {sources.map((s) => (
                  <li key={s.id} id={`check-source-${run.id}-${s.id}`} className={`r-source${s.id === targetSourceId ? " targeted" : ""}`}>
                    <div>
                      [{s.id}]{" "}
                      <a href={s.url} target="_blank" rel="noreferrer noopener">
                        {s.title}
                      </a>
                    </div>
                    <div className="r-meta">
                      <span>{s.domain}</span>
                      <span>{monthYear(s.published) ?? "Undated"}</span>
                      {s.readStatus && <span className="tag">{s.readStatus === "full" ? "Full page read" : "Snippets only"}</span>}
                      {s.authority && <span className="tag tag-strong">Official source</span>}
                      {s.cited && <span className="tag">Cited</span>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {r && r.skipped.length > 0 && (
            <section aria-labelledby={`cr-skipped-${run.id}`}>
              <h3 id={`cr-skipped-${run.id}`}>Not checked</h3>
              <ul>
                {r.skipped.map((s, i) => (
                  <li key={i} className="r-claim">
                    <span className="verdict verdict-meta">Skipped</span>
                    <span>{s.text}</span>
                    <span className="why">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r && r.warnings.length > 0 && (
            <section aria-labelledby={`cr-warn-${run.id}`}>
              <h3 id={`cr-warn-${run.id}`}>Warnings</h3>
              <ul className="r-meta" style={{ display: "block" }}>
                {r.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          {r && (
            <section aria-labelledby={`cr-time-${run.id}`}>
              <h3 id={`cr-time-${run.id}`}>Models, calls and timings</h3>
              <dl className="kv">
                {Object.entries(r.timingsMs)
                  .filter(([k]) => k !== "total")
                  .map(([step, ms]) => (
                    <div key={step} style={{ display: "contents" }}>
                      <dt>{STEP_LABEL[step] ?? step}</dt>
                      <dd>{(ms / 1000).toFixed(1)}s</dd>
                    </div>
                  ))}
                <dt>Total</dt>
                <dd>{(r.timingsMs.total / 1000).toFixed(1)}s</dd>
                <dt>You.com</dt>
                <dd>
                  {r.usage.you.searches} searches · {r.usage.you.contentsPages} pages read
                </dd>
                {Object.entries(r.models).map(([role, model]) => (
                  <div key={role} style={{ display: "contents" }}>
                    <dt>{ROLE_LABEL[role] ?? role}</dt>
                    <dd>{model}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
