import type { PipelineEvent, PipelineOptions, Receipts, TextResult, WhereTheyDiffer } from "@studyhall/core";

export type RunPipeline = (question: string, categoryId: string, opts: PipelineOptions) => AsyncGenerator<PipelineEvent>;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

const encoder = new TextEncoder();

/** One SSE message. The JSON payload is the whole event, including `type`. */
export function sseEvent(event: { type: string; [key: string]: unknown }): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

const PING = encoder.encode(": ping\n\n");

export interface StreamOptions {
  question: string;
  category: string;
  history: { question: string; answer: string }[];
  app?: string;
  run: RunPipeline;
  /** Compare mode: also stream a no-sources answer, then say where the two differ. */
  compare?: boolean;
  memory?: (signal: AbortSignal) => AsyncGenerator<string, TextResult>;
  differ?: (memoryText: string, receipts: Receipts, signal: AbortSignal) => Promise<WhereTheyDiffer>;
  /** The incoming request's signal; aborts when the client disconnects. */
  requestSignal?: AbortSignal;
  heartbeatMs?: number;
  log?: (msg: string) => void;
}

/**
 * Stream pipeline events as SSE. If the client disconnects (request aborted or stream cancelled),
 * the pipeline's AbortSignal fires, which cancels every in-flight upstream call.
 *
 * Compare mode adds, in the same stream: `memory_delta` / `memory_done` / `memory_error` from the
 * no-sources answer (running in parallel), then one `differ` (or `differ_error`) after both finish.
 */
export function answerStream(o: StreamOptions): ReadableStream<Uint8Array> {
  const upstream = new AbortController();
  const log = o.log ?? (() => {});
  const started = Date.now();
  let sent = 0;
  let lastType = "start";
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const abort = (why: string) => {
    if (upstream.signal.aborted) return;
    log(`client disconnected (${why}) after ${sent} events at "${lastType}", ${Date.now() - started}ms; aborting upstream calls`);
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
      const emit = (ev: { type: string; [k: string]: unknown }) => {
        lastType = ev.type;
        sent++;
        send(sseEvent(ev));
      };
      const gen = o.run(o.question, o.category, { signal: upstream.signal, history: o.history, ...(o.app ? { app: o.app } : {}) });
      let receipts: Receipts | undefined;

      const pipelineTask = (async () => {
        try {
          for await (const ev of gen) {
            if (upstream.signal.aborted) {
              // The step in flight finished before it saw the abort; closing the generator stops the rest.
              log(`pipeline stopped after abort: generator closed before "${ev.type}", ${Date.now() - started}ms`);
              break;
            }
            if (ev.type === "done") receipts = ev.receipts;
            emit(ev);
          }
        } catch (err) {
          if (upstream.signal.aborted) {
            log(`pipeline stopped after abort: ${err instanceof Error ? err.name : String(err)}, ${Date.now() - started}ms`);
          } else {
            log(`pipeline failed: ${err instanceof Error ? err.message : String(err)}`);
            emit({ type: "error", step: "server", message: "Something went wrong while answering. Please try again." });
          }
        } finally {
          await gen.return(undefined).catch(() => {});
        }
      })();

      let memoryText = "";
      const memoryTask = (async () => {
        if (!o.compare || !o.memory) return;
        try {
          const mg = o.memory(upstream.signal);
          let step = await mg.next();
          while (!step.done) {
            if (upstream.signal.aborted) return;
            memoryText += step.value;
            emit({ type: "memory_delta", text: step.value });
            step = await mg.next();
          }
          memoryText = step.value.text || memoryText;
          emit({ type: "memory_done", text: memoryText, model: step.value.model });
        } catch (err) {
          if (!upstream.signal.aborted) {
            log(`memory answer failed: ${err instanceof Error ? err.message : String(err)}`);
            emit({ type: "memory_error", message: "The from-memory answer didn't finish." });
          }
        }
      })();

      await Promise.all([pipelineTask, memoryTask]);

      if (o.compare && o.differ && !upstream.signal.aborted) {
        if (receipts?.outcome === "answered" && memoryText.trim()) {
          try {
            const d = await o.differ(memoryText, receipts, upstream.signal);
            emit({ type: "differ", agree: d.agree, differences: d.differences, model: d.model });
          } catch (err) {
            if (!upstream.signal.aborted) {
              log(`differ failed: ${err instanceof Error ? err.message : String(err)}`);
              emit({ type: "differ_error", message: "Couldn't compare the two answers." });
            }
          }
        } else {
          emit({ type: "differ_error", message: "There's no verified answer to compare against." });
        }
      }

      {
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
