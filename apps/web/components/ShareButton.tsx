"use client";

import { useEffect, useState } from "react";
import type { CheckReceipts, CodeCheckReceipts } from "@studyhall/core";

const KEY = "studyhall:share-passcode";
const getPass = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const setPass = (v: string) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // storage blocked: the passcode lasts for this page view only
  }
};

/** Shared across buttons on the page: whether the server has sharing on. */
let enabledPromise: Promise<boolean> | null = null;
const sharingEnabled = () =>
  (enabledPromise ??= fetch("/api/share")
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((d: { enabled?: boolean }) => Boolean(d.enabled))
    .catch(() => false));

const sourceUrl = (sources: { id: number; url: string }[], ids: number[]) => sources.find((s) => s.id === ids[0])?.url;

/** The facts to share, built only from verdicts, replacements, sources and dates: never pasted code or text. */
export function shareBody(r: { kind: "code"; receipts: CodeCheckReceipts } | { kind: "claim"; receipts: CheckReceipts }): object | null {
  if (r.kind === "code") {
    const facts = r.receipts.calls
      .filter((c) => (c.status === "deprecated" || c.status === "removed") && sourceUrl(r.receipts.sources, c.sourceIds))
      .slice(0, 6)
      .map((c) => ({ name: c.name, status: c.status, ...(c.replacement ? { replacement: c.replacement } : {}), source: sourceUrl(r.receipts.sources, c.sourceIds)! }));
    return facts.length ? { kind: "code", app: r.receipts.app, release: r.receipts.release, checkedAt: r.receipts.asOf, facts } : null;
  }
  const facts = r.receipts.claims
    .filter((c) => (c.verdict === "contradicted" || c.verdict === "supported") && sourceUrl(r.receipts.sources, c.sourceIds))
    .map((c) => ({ verdict: c.verdict, sourcesSay: (c.verdict === "contradicted" ? c.sourcesSay || c.evidence : c.evidence).slice(0, 300), source: sourceUrl(r.receipts.sources, c.sourceIds)! }))
    .filter((f) => f.sourcesSay.trim())
    .slice(0, 6);
  return facts.length ? { kind: "claim", checkedAt: r.receipts.asOf, facts } : null;
}

/**
 * "Share with my team's agents": posts the verified facts to the team's OpenCrawl board. Shown only
 * when the server has sharing on and this browser has the team passcode (entered once via ?team=1).
 */
export function ShareButton(props: { kind: "code"; receipts: CodeCheckReceipts } | { kind: "claim"; receipts: CheckReceipts }) {
  const [enabled, setEnabled] = useState(false);
  const [pass, setPassState] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<{ status: "idle" | "posting" | "done" | "error"; message?: string }>({ status: "idle" });

  useEffect(() => {
    void sharingEnabled().then(setEnabled);
    setPassState(getPass());
    setAsking(new URLSearchParams(window.location.search).get("team") === "1");
  }, []);

  const body = shareBody(props);
  if (!enabled || !body) return null;

  if (!pass) {
    if (!asking) return null;
    return (
      <form
        className="passcode-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await fetch("/api/share", { headers: { "x-share-passcode": draft } }).then((r) => r.json() as Promise<{ passcodeOk?: boolean }>).catch(() => ({ passcodeOk: false }));
          if (res.passcodeOk) {
            setPass(draft);
            setPassState(draft);
          } else setState({ status: "error", message: "That passcode isn't right." });
        }}
      >
        <label>
          Team passcode{" "}
          <input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
        </label>
        <button type="submit" className="link-button">
          Save
        </button>
        {state.status === "error" && <span className="unverified">{state.message}</span>}
      </form>
    );
  }

  return (
    <span className="share-wrap">
      <button
        type="button"
        className="share-button"
        disabled={state.status === "posting" || state.status === "done"}
        onClick={async () => {
          setState({ status: "posting" });
          try {
            const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json", "x-share-passcode": pass }, body: JSON.stringify(body) });
            const d = (await res.json()) as { posted?: number; topic?: string; message?: string };
            if (res.ok) setState({ status: "done", message: `Shared ${d.posted} verified fact${d.posted === 1 ? "" : "s"} to the “${d.topic}” board.` });
            else setState({ status: "error", message: d.message ?? "Couldn't share." });
          } catch {
            setState({ status: "error", message: "Couldn't reach the server." });
          }
        }}
      >
        {state.status === "posting" ? "Sharing…" : state.status === "done" ? "Shared" : "Share with my team's agents"}
      </button>
      {state.message && (
        <span className={state.status === "error" ? "unverified" : undefined} role="status">
          {state.message}
        </span>
      )}
    </span>
  );
}
