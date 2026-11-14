"use client";

import { useEffect, useRef } from "react";
import type { Receipts } from "@studyhall/core";
import { monthYear, VERDICT_TEXT, type Turn } from "../lib/client/turn";

const STEP_LABEL: Record<string, string> = {
  classify: "Pick category",
  plan: "Plan searches",
  search: "Search",
  read: "Read pages",
  notes: "Study notes",
  answer: "Answer",
  verify: "Verify",
  repair: "Repair",
  reverify: "Re-verify",
  total: "Total",
};

/** "snippets only (page could not be crawled)" → "Page could not be crawled" (the tag already says snippets only). */
function readNoteText(note: string): string {
  const inner = note.replace(/^snippets only \((.*)\)$/i, "$1");
  return inner.charAt(0).toUpperCase() + inner.slice(1);
}

const VERDICT_SHORT = { supported: "Supported", partial: "Partial", unsupported: "Unsupported", meta: "Not checked" } as const;

/** Receipts: a right-hand panel on desktop, a bottom sheet on mobile. Traps focus; Escape closes. */
export function ReceiptsDrawer({ turn, targetSourceId, onClose }: { turn: Turn; targetSourceId?: number; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const r: Receipts | undefined = turn.receipts;
  const sources = r?.sources ?? turn.sources.map((s) => ({ ...s, readStatus: undefined, readNote: undefined, cited: undefined }));

  useEffect(() => {
    closeBtn.current?.focus();
    if (targetSourceId !== undefined) document.getElementById(`receipt-source-${turn.id}-${targetSourceId}`)?.scrollIntoView({ block: "center" });
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, targetSourceId, turn.id]);

  const timings = r ? Object.entries(r.timingsMs).filter(([k]) => k !== "total") : [];

  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={`receipts-title-${turn.id}`} ref={panel}>
        <div className="drawer-head">
          <h2 id={`receipts-title-${turn.id}`}>Receipts</h2>
          <button type="button" className="icon-button" onClick={onClose} ref={closeBtn} aria-label="Close receipts">
            ×
          </button>
        </div>
        <div className="drawer-body">
          {!r && <p className="r-meta">Receipts are complete once the answer has been checked.</p>}

          {r?.software && (
            <section aria-labelledby={`rsw-${turn.id}`}>
              <h3 id={`rsw-${turn.id}`}>Software</h3>
              <p style={{ margin: 0 }}>
                {r.software.apps.length ? r.software.apps.map((a) => a.name).join(" and ") : "No app named"}
                {" · "}
                {r.software.how === "selected" ? "picked by you" : r.software.how === "named" ? "named in the question" : "the answer says which app it assumed"}
                {r.software.version ? ` · version mentioned: ${r.software.version}` : ""}
              </p>
              {r.currentRelease && (
                <p className="r-meta" style={{ display: "block", marginTop: 6 }}>
                  Current release: <strong>{r.currentRelease.release}</strong>
                  {r.currentRelease.sourceId !== undefined ? ` (source ${r.currentRelease.sourceId})` : ""} ·{" "}
                  <a href={r.currentRelease.source.url} target="_blank" rel="noreferrer noopener">
                    {r.currentRelease.source.title}
                  </a>
                  {r.currentRelease.olderDocs ? ` · the cited docs are for ${r.currentRelease.citedReleases?.join(" and ") || "an older release"}` : ""}
                </p>
              )}
            </section>
          )}

          {turn.queries.length > 0 && (
            <section aria-labelledby={`rq-${turn.id}`}>
              <h3 id={`rq-${turn.id}`}>Queries</h3>
              <ol>
                {turn.queries.map((q) => (
                  <li key={q} className="r-query">
                    “{q}”
                  </li>
                ))}
              </ol>
            </section>
          )}

          {sources.length > 0 && (
            <section aria-labelledby={`rs-${turn.id}`}>
              <h3 id={`rs-${turn.id}`}>Sources</h3>
              <ol>
                {sources.map((s) => (
                  <li key={s.id} id={`receipt-source-${turn.id}-${s.id}`} className={`r-source${s.id === targetSourceId ? " targeted" : ""}`}>
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
                    {s.readNote && <div className="r-meta">{readNoteText(s.readNote)}</div>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {r && r.claims.length > 0 && (
            <section aria-labelledby={`rc-${turn.id}`}>
              <h3 id={`rc-${turn.id}`}>Claims</h3>
              <ul>
                {r.claims.map((c, i) => (
                  <li key={i} className="r-claim">
                    <span className={`verdict verdict-${c.verdict}`}>{VERDICT_SHORT[c.verdict]}</span>
                    <span>
                      {c.kind === "code" ? (
                        <>
                          Code: <code>{c.text}</code>
                        </>
                      ) : (
                        c.text
                      )}
                      {c.repair === "rewritten" && <em> (rewritten and re-checked)</em>}
                    </span>
                    <span className="why">
                      {VERDICT_TEXT[c.verdict]}
                      {c.note ? `: ${c.note}` : "."}
                      {c.sourceIds.length > 0 && ` Sources ${c.sourceIds.join(", ")}.`}
                    </span>
                  </li>
                ))}
                {r.removedClaims.map((c, i) => (
                  <li key={`x${i}`} className="r-claim">
                    <span className="verdict verdict-unsupported">Removed</span>
                    <span>
                      <s>{c.text}</s>
                    </span>
                    <span className="why">Deleted by the repair pass: {c.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r && (
            <section aria-labelledby={`rconf-${turn.id}`}>
              <h3 id={`rconf-${turn.id}`}>Confidence</h3>
              <p style={{ margin: 0 }}>
                <strong>{r.confidence[0]!.toUpperCase() + r.confidence.slice(1)}.</strong> {r.confidenceReasons.join(" ")}
              </p>
              {r.warnings.length > 0 && (
                <ul className="r-meta" style={{ display: "block", marginTop: 8 }}>
                  {r.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {r && (
            <section aria-labelledby={`rm-${turn.id}`}>
              <h3 id={`rm-${turn.id}`}>Models and timings</h3>
              <dl className="kv">
                {timings.map(([step, ms]) => (
                  <div key={step} style={{ display: "contents" }}>
                    <dt>{STEP_LABEL[step] ?? step}</dt>
                    <dd>
                      {((ms as number) / 1000).toFixed(1)}s{r.models[step as keyof typeof r.models] ? ` · ${r.models[step as keyof typeof r.models]}` : ""}
                    </dd>
                  </div>
                ))}
                <dt>Total</dt>
                <dd>{(r.timingsMs.total / 1000).toFixed(1)}s (notes run alongside the answer)</dd>
              </dl>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
