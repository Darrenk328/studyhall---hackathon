import type { CheckEvent } from "@studyhall/core";
import { sseEvent } from "./answer-stream";

const PING = new TextEncoder().encode(": ping\n\n");

/**
 * Stream "Check a claim" events as SSE, in the same style as /api/answer: one `event:`/`data:`
 * message per event, a heartbeat comment every 15s, and a client disconnect (request aborted or
 * stream cancelled) aborts every upstream call through the run's AbortSignal.
 */
export function checkStream(o: {
  run: (signal: AbortSignal) => AsyncGenerator<CheckEvent>;
  requestSignal?: AbortSignal;
  heartbeatMs?: number;
  log?: (msg: string) => void;
}): ReadableStream<Uint8Array> {
  const upstream = new AbortController();
  const log = o.log ?? (() => {});
  const started = Date.now();
  let sent = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const abort = (why: string) => {
    if (upstream.signal.aborted) return;
    log(`client disconnected (${why}) after ${sent} events, ${Date.now() - started}ms; aborting upstream calls`);
    upstream.abort(new DOMException("Client disconnected", "AbortError"));
  };
  o.requestSignal?.addEventListener("abort", () => abort("request aborted"), { once: true });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (bytes: Uint8Array) => {
        if (upstream.signal.aborted) return;
        try {
          controller.enqueue(bytes);
        } catch {
          abort("enqueue failed");
        }
      };
      heartbeat = setInterval(() => send(PING), o.heartbeatMs ?? 15_000);
      const gen = o.run(upstream.signal);
      try {
        for await (const ev of gen) {
          if (upstream.signal.aborted) break;
          sent++;
          send(sseEvent(ev));
        }
      } catch (err) {
        if (upstream.signal.aborted) log(`check stopped after abort: ${err instanceof Error ? err.name : String(err)}`);
        else {
          log(`check failed: ${err instanceof Error ? err.message : String(err)}`);
          sent++;
          send(sseEvent({ type: "error", step: "server", message: "Something went wrong while checking. Please try again." }));
        }
      } finally {
        await gen.return(undefined).catch(() => {});
        clearInterval(heartbeat);
        if (!upstream.signal.aborted) {
          log(`done: ${sent} events in ${Date.now() - started}ms`);
          try {
            controller.close();
          } catch {
            // already closed by a cancel
          }
        }
      }
    },
    cancel() {
      clearInterval(heartbeat);
      abort("stream cancelled");
    },
  });
}
