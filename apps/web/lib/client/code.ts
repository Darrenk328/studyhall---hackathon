/**
 * Client-side state for "Check my code": one code paste and everything /api/code-check streamed
 * back. `applyCodeEvent` is a pure reducer, like the ones for answers and claim checks.
 */
import type { ApiCall, CallStatus, CheckedCall, CodeCheckEvent, CodeCheckReceipts, CodeLang } from "@studyhall/core";

/** Mirrors core's MAX_CODE_LINES and the API's character limit (client code doesn't import core at runtime). */
export const MAX_CODE_LINES = 150;
export const MAX_CODE_CHARS = 8_000;
export const CODE_ID = "code";

export const LANG_LABEL: Record<CodeLang, string> = { matlab: "MATLAB", fusion: "Fusion (Python API)", ilogic: "Inventor (iLogic / VB.NET)" };

export interface CallCard extends ApiCall {
  phase?: "searching" | "reading" | "judging";
  result?: CheckedCall;
}

export interface CodeRun {
  id: string;
  code: string;
  lang?: CodeLang;
  app?: string;
  release?: string;
  releaseSource?: CodeCheckReceipts["releaseSource"];
  status: "running" | "done" | "stopped" | "failed";
  statusText: string;
  calls: CallCard[];
  receipts?: CodeCheckReceipts;
  message?: string;
  error?: string;
  startedAt: number;
  replayOf?: string;
}

export function newCodeRun(code: string, id = crypto.randomUUID()): CodeRun {
  return { id, code, status: "running", statusText: "Reading the code…", calls: [], startedAt: Date.now() };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const STATUS_LABEL: Record<CallStatus, string> = {
  current: "Current",
  deprecated: "Deprecated",
  removed: "Removed",
  not_found: "Not found",
  unverifiable: "Unverifiable",
};

export const STATUS_MEANING: Record<CallStatus, string> = {
  current: "Documented for this release.",
  deprecated: "The official docs mark it not recommended, deprecated or retired.",
  removed: "The official docs say it was removed or now errors.",
  not_found: "Not found in the official docs searched for this release.",
  unverifiable: "The docs that were found don't settle it.",
};

export function applyCodeEvent(r: CodeRun, ev: CodeCheckEvent): CodeRun {
  switch (ev.type) {
    case "code_parsed":
      return { ...r, lang: ev.lang, app: ev.app, calls: ev.calls.map((c) => ({ ...c })), statusText: ev.calls.length ? `Found ${plural(ev.calls.length, "API call")}. Looking up the current release…` : "No API calls found." };
    case "release":
      return { ...r, release: ev.release, releaseSource: ev.source, statusText: `Checking ${plural(r.calls.length, "call")} against the official ${r.app ?? ""} docs for ${ev.release}…` };
    case "call_progress":
      return { ...r, calls: r.calls.map((c) => (c.name === ev.name ? { ...c, phase: ev.phase } : c)) };
    case "call_verdict": {
      const calls = r.calls.map((c) => (c.name === ev.call.name ? { ...c, result: ev.call } : c));
      return { ...r, calls, statusText: `Checked ${calls.filter((c) => c.result).length} of ${plural(calls.length, "call")}…` };
    }
    case "code_done": {
      const rec = ev.receipts;
      const byName = new Map(rec.calls.map((c) => [c.name, c]));
      return {
        ...r,
        status: "done",
        receipts: rec,
        lang: rec.lang,
        app: rec.app,
        release: rec.release,
        releaseSource: rec.releaseSource,
        calls: (r.calls.length ? r.calls : rec.calls).map((c) => ({ ...c, ...(byName.get(c.name) ? { result: byName.get(c.name)! } : {}) })),
        statusText: rec.outcome === "checked" ? `${rec.summary} · ${(rec.timingsMs.total / 1000).toFixed(1)}s` : "",
        ...(rec.message ? { message: rec.message } : {}),
      };
    }
    case "error":
      return r.calls.some((c) => c.result) ? r : { ...r, error: ev.message || "Something went wrong while checking." };
  }
}

export function finishCodeRun(r: CodeRun, how: "ended" | "stopped" | "failed", message?: string): CodeRun {
  if (r.status === "done") return r;
  if (how === "stopped") return { ...r, status: "stopped", statusText: "Stopped." };
  return { ...r, status: "failed", statusText: r.calls.some((c) => c.result) ? "Connection ended before every call was checked." : "", ...(r.calls.some((c) => c.result) ? {} : { error: r.error ?? message ?? "Something went wrong while checking. Please try again." }) };
}

/** Examples: each is from the code-check eval (evals/code-snippets.jsonl), with its status confirmed on an official page. */
export const CODE_EXAMPLES: { label: string; lang: CodeLang; expect: string; code: string }[] = [
  {
    label: "MATLAB: install a toolbox",
    lang: "matlab",
    expect: "flags matlab.addons.install → mpminstall",
    code: '% Install a toolbox from a file\nmatlab.addons.install("SignalTools.mltbx");\ndisp("Installed");',
  },
  {
    label: "Fusion: sketch a rectangle",
    lang: "fusion",
    expect: "the sketch calls are current",
    code: "import adsk.core, adsk.fusion\n\ndef run(context):\n    app = adsk.core.Application.get()\n    root = adsk.fusion.Design.cast(app.activeProduct).rootComponent\n    sketch = root.sketches.add(root.xYConstructionPlane)\n    sketch.sketchCurves.sketchLines.addTwoPointRectangle(adsk.core.Point3D.create(0, 0, 0), adsk.core.Point3D.create(5, 5, 0))",
  },
  {
    label: "iLogic: read the part number",
    lang: "ilogic",
    expect: "flags iProperties.ValueInDoc → iProperties.Value",
    code: "' Read the part number of the active document\nDim pn As String = iProperties.ValueInDoc(ThisDoc.Document, \"Project\", \"Part Number\")\nMessageBox.Show(pn, \"Part number\")",
  },
];

const KEY = "studyhall:code:runs";
export function loadCodeRuns(): CodeRun[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CodeRun[]).map((r) => (r.status === "running" ? finishCodeRun(r, "stopped") : r)) : [];
  } catch {
    return [];
  }
}
export function saveCodeRuns(runs: CodeRun[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(runs.slice(-3)));
  } catch {
    // storage full or blocked
  }
}
