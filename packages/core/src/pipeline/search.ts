import type { Category, FreshnessWindow } from "../categories/types.js";
import { parsePageAge, type SearchHit } from "../providers/you.js";
import { domainOf, matchesAny, normalizeUrl, WINDOW_MS } from "./text.js";
import type { SearchProvider } from "./types.js";

/** A merged search result before reading. */
export interface Candidate {
  key: string;
  url: string;
  title: string;
  domain: string;
  description: string;
  snippets: string[];
  published?: Date;
  /** Best (lowest) 0-based rank across queries. */
  bestRank: number;
  foundBy: string[];
  preferred: boolean;
  /** On the category's authority list (official/primary source). */
  authority: boolean;
  blocked: boolean;
  score: number;
}

export function recencyBoost(published: Date | undefined, freshness: FreshnessWindow, now: Date): number {
  if (!published || freshness === "any") return 0;
  const age = now.getTime() - published.getTime();
  const win = WINDOW_MS[freshness];
  if (age <= win) return 1;
  if (age <= 2 * win) return 0.5;
  return 0;
}

/**
 * PLAN.md §4 step 2:
 * score = rankScore + 2*(preferred) + 1*(found by >1 query) + recencyBoost - 99*(blocked)
 * rankScore = 1 - bestRank/perQuery, so the top hit of any query scores 1.
 */
export function scoreCandidate(c: Omit<Candidate, "score">, perQuery: number, freshness: FreshnessWindow, now: Date): number {
  const rankScore = Math.max(0, 1 - c.bestRank / Math.max(perQuery, 1));
  return (
    rankScore +
    (c.preferred ? 2 : 0) +
    (c.foundBy.length > 1 ? 1 : 0) +
    recencyBoost(c.published, freshness, now) -
    (c.blocked ? 99 : 0)
  );
}

/** Merge results from several queries, dedupe by normalized URL, and score. */
export function mergeAndRank(
  results: { query: string; hits: SearchHit[] }[],
  category: Category,
  perQuery: number,
  now: Date,
): Candidate[] {
  const byKey = new Map<string, Omit<Candidate, "score">>();
  for (const { query, hits } of results) {
    for (const h of hits) {
      const key = normalizeUrl(h.url);
      const existing = byKey.get(key);
      if (existing) {
        existing.bestRank = Math.min(existing.bestRank, h.rank);
        if (!existing.foundBy.includes(query)) existing.foundBy.push(query);
        for (const s of h.snippets) if (!existing.snippets.includes(s)) existing.snippets.push(s);
        existing.published ??= parsePageAge(h.pageAge);
        continue;
      }
      const domain = domainOf(h.url);
      const published = parsePageAge(h.pageAge);
      byKey.set(key, {
        key,
        url: h.url,
        title: h.title,
        domain,
        description: h.description,
        snippets: [...h.snippets],
        ...(published ? { published } : {}),
        bestRank: h.rank,
        foundBy: [query],
        preferred: matchesAny(domain, category.preferredDomains),
        authority: matchesAny(domain, category.authorityDomains),
        blocked: matchesAny(domain, category.blockedDomains),
      });
    }
  }
  return [...byKey.values()]
    .map((c) => ({ ...c, score: scoreCandidate(c, perQuery, category.freshness, now) }))
    .sort((a, b) => b.score - a.score || a.bestRank - b.bestRank);
}

export interface SearchOutcome {
  candidates: Candidate[];
  /** True when too few results came back inside the freshness window and we searched again without it. */
  freshnessRelaxed: boolean;
  failedQueries: { query: string; error: string }[];
}

export async function searchAll(
  you: SearchProvider,
  queries: string[],
  category: Category,
  now: Date,
  opts: { perQuery: number; topN: number; alsoUndated?: boolean },
): Promise<SearchOutcome> {
  const failed: SearchOutcome["failedQueries"] = [];
  const run = async (freshness: FreshnessWindow) => {
    const settled = await Promise.allSettled(
      queries.map((query) =>
        you.search({
          query,
          count: opts.perQuery,
          ...(freshness !== "any" ? { freshness } : {}),
          ...(category.preferredDomains.length ? { boostDomains: category.preferredDomains } : {}),
          ...(category.blockedDomains.length ? { excludeDomains: category.blockedDomains } : {}),
        }),
      ),
    );
    const ok: { query: string; hits: SearchHit[] }[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") ok.push({ query: queries[i]!, hits: s.value });
      else failed.push({ query: queries[i]!, error: s.reason instanceof Error ? s.reason.message : String(s.reason) });
    });
    return ok;
  };

  // Version-aware categories search both inside the freshness window and without it: official docs
  // and release notes are often older than the window but are exactly what the answer needs.
  const both = Boolean(opts.alsoUndated) && category.freshness !== "any";
  let results = both ? (await Promise.all([run(category.freshness), run("any")])).flat() : await run(category.freshness);
  if (results.length === 0 && failed.length === queries.length) {
    throw new Error(`All ${queries.length} searches failed: ${failed[0]?.error ?? "unknown error"}`);
  }
  let freshnessRelaxed = false;
  const enough = Math.max(category.minSources, 3);
  const unblocked = (rs: typeof results) => mergeAndRank(rs, category, opts.perQuery, now).filter((c) => !c.blocked);
  if (!both && category.freshness !== "any" && unblocked(results).length < enough) {
    freshnessRelaxed = true;
    results = [...results, ...(await run("any"))];
  }
  const candidates = unblocked(results).slice(0, opts.topN);
  return { candidates, freshnessRelaxed, failedQueries: failed };
}
