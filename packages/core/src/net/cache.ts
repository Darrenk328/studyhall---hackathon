import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { envFlag, projectRoot } from "../env.js";

/**
 * Dev-only disk cache for provider responses, keyed by a hash of the request.
 * Stores the raw JSON (before Zod parsing) so schema checks still run on cache hits.
 */
export interface ResponseCache {
  get(namespace: string, request: unknown): Promise<unknown | undefined>;
  set(namespace: string, request: unknown, response: unknown): Promise<void>;
}

export const noCache: ResponseCache = {
  get: async () => undefined,
  set: async () => {},
};

/** Stable JSON: object keys sorted, so equal requests hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function cacheKey(namespace: string, request: unknown): string {
  return createHash("sha256").update(namespace).update("\0").update(stableStringify(request)).digest("hex");
}

export class DiskCache implements ResponseCache {
  constructor(readonly dir: string) {}

  private path(namespace: string, request: unknown): string {
    return join(this.dir, namespace, `${cacheKey(namespace, request)}.json`);
  }

  async get(namespace: string, request: unknown): Promise<unknown | undefined> {
    try {
      const raw = await readFile(this.path(namespace, request), "utf8");
      return (JSON.parse(raw) as { response: unknown }).response;
    } catch {
      return undefined;
    }
  }

  async set(namespace: string, request: unknown, response: unknown): Promise<void> {
    const file = this.path(namespace, request);
    await mkdir(join(this.dir, namespace), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ savedAt: new Date().toISOString(), request, response }));
    await rename(tmp, file);
  }
}

/** Cache from env: on when STUDYHALL_CACHE=1 and not in production. */
export function cacheFromEnv(): ResponseCache {
  if (process.env.NODE_ENV === "production" || !envFlag("STUDYHALL_CACHE")) return noCache;
  return new DiskCache(resolve(/*turbopackIgnore: true*/ projectRoot(), process.env.STUDYHALL_CACHE_DIR ?? ".cache/studyhall"));
}
