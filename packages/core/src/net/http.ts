import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly bodySnippet: string,
  ) {
    super(`HTTP ${status} from ${url}: ${bodySnippet}`);
    this.name = "HttpError";
  }
}

export class TimeoutError extends Error {
  constructor(readonly url: string, readonly timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/** A provider returned JSON that does not match the schema we expect (API drift). */
export class SchemaError extends Error {
  constructor(readonly source: string, readonly issues: string) {
    super(`Unexpected response shape from ${source}: ${issues}`);
    this.name = "SchemaError";
  }
}

export interface RetryPolicy {
  /** Retries after the first attempt. */
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { retries: 3, baseDelayMs: 500, maxDelayMs: 8_000 };

/** PLAN.md §4: retry only on 429 and 5xx. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export function backoffDelay(attempt: number, policy: RetryPolicy, retryAfter?: string | null): number {
  const fromHeader = parseRetryAfter(retryAfter);
  if (fromHeader !== undefined) return Math.min(fromHeader, policy.maxDelayMs);
  const exp = policy.baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * policy.baseDelayMs;
  return Math.min(exp + jitter, policy.maxDelayMs);
}

function parseRetryAfter(value?: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export interface JsonRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retry?: RetryPolicy;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetch JSON with a per-attempt timeout and retries on 429/5xx. Returns the raw parsed JSON. */
export async function fetchJson(req: JsonRequest): Promise<unknown> {
  const {
    url,
    method = "POST",
    headers = {},
    body,
    timeoutMs = 20_000,
    retry = DEFAULT_RETRY,
    fetchImpl = fetch,
    sleep = realSleep,
  } = req;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new TimeoutError(url, timeoutMs);
      }
      throw err;
    }

    if (res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new SchemaError(url, `body is not JSON: ${text.slice(0, 200)}`);
      }
    }

    const snippet = (await res.text().catch(() => "")).slice(0, 300);
    if (attempt < retry.retries && isRetryableStatus(res.status)) {
      await sleep(backoffDelay(attempt, retry, res.headers.get("retry-after")));
      continue;
    }
    throw new HttpError(res.status, url, snippet);
  }
}

/** Parse with Zod and raise a SchemaError that names the failing paths. */
export function parseWith<T extends z.ZodType>(schema: T, data: unknown, source: string): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  throw new SchemaError(source, issues);
}
