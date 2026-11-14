import { z } from "zod";
import { requireEnv } from "../env.js";
import { cacheFromEnv, type ResponseCache } from "../net/cache.js";
import { fetchJson, parseWith, type RetryPolicy, DEFAULT_RETRY } from "../net/http.js";

/**
 * You.com Search + Contents clients.
 * Schemas follow you.com/docs (checked 2026-11-11). See DECISIONS.md for differences from PLAN.md.
 */

export const SEARCH_URL = "https://ydc-index.io/v1/search";
export const CONTENTS_URL = "https://ydc-index.io/v1/contents";

// ---------- wire schemas ----------

export const Freshness = z.union([
  z.enum(["day", "week", "month", "year"]),
  z.string().regex(/^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/),
]);
export type Freshness = z.infer<typeof Freshness>;

const WebResultWire = z.object({
  url: z.string(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  snippets: z.array(z.string()).nullish(),
  page_age: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
  favicon_url: z.string().nullish(),
  contents: z
    .object({
      markdown: z.string().nullish(),
      html: z.string().nullish(),
      highlights: z.array(z.string()).nullish(),
    })
    .nullish(),
});

/** Docs say news arrives inside `web`; older responses had a separate `news` array. Accept both. */
export const SearchResponseWire = z.object({
  results: z.object({
    web: z.array(WebResultWire).nullish(),
    news: z.array(WebResultWire).nullish(),
  }),
  metadata: z
    .object({
      search_uuid: z.string().nullish(),
      query: z.string().nullish(),
      latency: z.number().nullish(),
    })
    .nullish(),
});

export const ContentsResponseWire = z.array(
  z.object({
    url: z.string(),
    title: z.string().nullish(),
    markdown: z.string().nullish(),
    html: z.string().nullish(),
    metadata: z
      .object({ site_name: z.string().nullish(), favicon_url: z.string().nullish() })
      .nullish(),
  }),
);

// ---------- normalized types ----------

export interface SearchHit {
  url: string;
  title: string;
  description: string;
  snippets: string[];
  /** Raw `page_age` from You.com (ISO-ish timestamp), if present. */
  pageAge?: string;
  /** 0-based rank within this query's results. */
  rank: number;
  kind: "web" | "news";
}

export interface SearchParams {
  query: string;
  count?: number;
  freshness?: Freshness;
  country?: string;
  /** Strict allowlist. Cannot be combined with excludeDomains or boostDomains. */
  includeDomains?: string[];
  excludeDomains?: string[];
  /** Ranking boost (not a filter). */
  boostDomains?: string[];
}

export interface PageContent {
  url: string;
  title?: string;
  siteName?: string;
  /** Markdown text, or null when the crawl failed. */
  markdown: string | null;
  status: "ok" | "failed" | "missing";
}

export interface YouClientOptions {
  apiKey?: string;
  cache?: ResponseCache;
  timeoutMs?: number;
  retry?: RetryPolicy;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class YouClient {
  private readonly apiKey: string;
  private readonly cache: ResponseCache;
  private readonly opts: YouClientOptions;

  constructor(opts: YouClientOptions = {}) {
    this.apiKey = opts.apiKey ?? requireEnv("YDC_API_KEY");
    this.cache = opts.cache ?? cacheFromEnv();
    this.opts = opts;
  }

  private async post(namespace: string, url: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    const cached = await this.cache.get(namespace, body);
    if (cached !== undefined) return cached;
    const raw = await fetchJson({
      url,
      method: "POST",
      headers: { "X-API-Key": this.apiKey },
      body,
      timeoutMs: this.opts.timeoutMs ?? timeoutMs,
      retry: this.opts.retry ?? DEFAULT_RETRY,
      fetchImpl: this.opts.fetchImpl,
      sleep: this.opts.sleep,
      ...(signal ? { signal } : {}),
    });
    await this.cache.set(namespace, body, raw);
    return raw;
  }

  async search(params: SearchParams, opts: { signal?: AbortSignal } = {}): Promise<SearchHit[]> {
    const body = buildSearchBody(params);
    const raw = await this.post("you-search", SEARCH_URL, body, 15_000, opts.signal);
    return normalizeSearch(parseWith(SearchResponseWire, raw, "You.com search"));
  }

  /** Fetch page text for up to 10 URLs. Every requested URL gets an entry, in request order. */
  async contents(urls: string[], opts: { crawlTimeoutSec?: number; signal?: AbortSignal } = {}): Promise<PageContent[]> {
    if (urls.length === 0) return [];
    if (urls.length > 10) throw new RangeError("You.com contents accepts at most 10 URLs per request");
    const crawl = opts.crawlTimeoutSec ?? 10;
    const body = { urls, formats: ["markdown", "metadata"], crawl_timeout: crawl };
    // Allow the whole batch time to crawl, plus headroom.
    const raw = await this.post("you-contents", CONTENTS_URL, body, (crawl + 5) * 1000, opts.signal);
    return normalizeContents(urls, parseWith(ContentsResponseWire, raw, "You.com contents"));
  }
}

export function buildSearchBody(p: SearchParams): Record<string, unknown> {
  if (!p.query.trim()) throw new RangeError("search query is empty");
  if (p.includeDomains?.length && (p.excludeDomains?.length || p.boostDomains?.length)) {
    throw new RangeError("includeDomains cannot be combined with excludeDomains or boostDomains");
  }
  const count = Math.min(Math.max(p.count ?? 10, 1), 100);
  return {
    query: p.query,
    count,
    ...(p.freshness ? { freshness: Freshness.parse(p.freshness) } : {}),
    ...(p.country ? { country: p.country } : {}),
    ...(p.includeDomains?.length ? { include_domains: p.includeDomains } : {}),
    ...(p.excludeDomains?.length ? { exclude_domains: p.excludeDomains } : {}),
    ...(p.boostDomains?.length ? { boost_domains: p.boostDomains } : {}),
  };
}

export function normalizeSearch(res: z.infer<typeof SearchResponseWire>): SearchHit[] {
  const toHit = (kind: SearchHit["kind"]) => (r: z.infer<typeof WebResultWire>, rank: number): SearchHit => ({
    url: r.url,
    title: r.title?.trim() || r.url,
    description: r.description?.trim() ?? "",
    snippets: r.snippets ?? [],
    ...(r.page_age ? { pageAge: r.page_age } : {}),
    rank,
    kind,
  });
  return [...(res.results.web ?? []).map(toHit("web")), ...(res.results.news ?? []).map(toHit("news"))];
}

/** Loose URL identity for matching API echoes: ignores scheme, `www.`, trailing slash and fragment. */
export function looseUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** You.com `page_age` has no timezone (e.g. "2026-11-06T12:28:05"); treat it as UTC. */
export function parsePageAge(pageAge: string | undefined): Date | undefined {
  if (!pageAge) return undefined;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(pageAge);
  const d = new Date(hasZone ? pageAge : `${pageAge}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function normalizeContents(
  requested: string[],
  res: z.infer<typeof ContentsResponseWire>,
): PageContent[] {
  const byUrl = new Map(res.map((r) => [r.url, r]));
  const byLooseUrl = new Map(res.map((r) => [looseUrlKey(r.url), r]));
  return requested.map((url) => {
    const r = byUrl.get(url) ?? byLooseUrl.get(looseUrlKey(url));
    if (!r) return { url, markdown: null, status: "missing" };
    const md = r.markdown?.trim() ? r.markdown : null;
    return {
      url,
      ...(r.title ? { title: r.title } : {}),
      ...(r.metadata?.site_name ? { siteName: r.metadata.site_name } : {}),
      markdown: md,
      status: md ? "ok" : "failed",
    };
  });
}
