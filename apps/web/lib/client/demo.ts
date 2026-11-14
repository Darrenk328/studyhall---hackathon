/**
 * Demo replay (`/?demo=1`): answers recorded live from /api/answer, replayed with their original
 * timing so a demo doesn't depend on venue Wi-Fi or API latency. The UI labels every replayed
 * answer as a recording, with the time it was recorded. Questions without a recording run live.
 */
import type { CheckEvent, CodeCheckEvent, CodeLang } from "@studyhall/core";
import type { ClientEvent } from "./turn";

export interface DemoRecording {
  question: string;
  category: string;
  app?: string;
  compare?: boolean;
  /** ISO time the answer was recorded. */
  recordedAt: string;
  /** Events with their offset from the request, in ms. */
  events: { t: number; ev: ClientEvent }[];
}

/** A recorded "Check a claim" run (category "check"). */
export interface CheckRecording {
  mode: "check";
  /** The pasted text. */
  question: string;
  category: "check";
  recordedAt: string;
  events: { t: number; ev: CheckEvent }[];
}

/** A recorded "Check my code" run (category "code"). */
export interface CodeRecording {
  mode: "code";
  /** The pasted code. */
  question: string;
  category: "code";
  lang?: CodeLang;
  recordedAt: string;
  events: { t: number; ev: CodeCheckEvent }[];
}

export type AnyRecording = DemoRecording | CheckRecording | CodeRecording;
export const isCheckRecording = (r: AnyRecording): r is CheckRecording => (r as CheckRecording).mode === "check";
export const isCodeRecording = (r: AnyRecording): r is CodeRecording => (r as CodeRecording).mode === "code";

export interface DemoSet {
  recordedAt: string;
  items: AnyRecording[];
}

export const DEMO_URL = "/demo/recordings.json";

export function isDemoMode(search: string): boolean {
  const v = new URLSearchParams(search).get("demo");
  return v === "1" || v === "true";
}

/** Replay speed from `?speed=2` (1 to 4; default 1, real time). */
export function demoSpeed(search: string): number {
  const n = Number(new URLSearchParams(search).get("speed"));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 4) : 1;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "").trim();

/** The recording for this question (same wording, any punctuation/case), if there is one. */
export function findRecording(set: DemoSet | null, question: string): DemoRecording | undefined {
  return set?.items.find((r): r is DemoRecording => !isCheckRecording(r) && !isCodeRecording(r) && norm(r.question) === norm(question));
}

/** The recorded check for this pasted text, if there is one. */
export function findCheckRecording(set: DemoSet | null, text: string): CheckRecording | undefined {
  return set?.items.find((r): r is CheckRecording => isCheckRecording(r) && norm(r.question) === norm(text));
}

/** Yield the recorded events at their recorded offsets (divided by `speed`); stops on abort. */
export async function* replay<E = ClientEvent>(rec: { events: { t: number; ev: E }[] }, signal: AbortSignal, speed = 1, sleep = abortableSleep): AsyncGenerator<E> {
  let last = 0;
  for (const { t, ev } of rec.events) {
    const wait = Math.max(0, (t - last) / speed);
    last = t;
    if (wait > 0) await sleep(wait, signal);
    if (signal.aborted) throw new DOMException("Replay stopped", "AbortError");
    yield ev;
  }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Replay stopped", "AbortError"));
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Replay stopped", "AbortError"));
      },
      { once: true },
    );
  });
}

/** The recorded code check for this code, if there is one (whitespace-insensitive). */
export function findCodeRecording(set: DemoSet | null, code: string): CodeRecording | undefined {
  const squash = (c: string) => c.replace(/\s+/g, " ").trim();
  return set?.items.find((r): r is CodeRecording => isCodeRecording(r) && squash(r.question) === squash(code));
}
