/**
 * Current-release discovery for version-aware categories. When the user didn't name a version, one
 * cheap search plus a Haiku read of the results finds the app's current release, so the answer can
 * prefer that release's docs and say when the docs it used are older.
 */
import { z } from "zod";
import type { AppConfig, Category } from "../categories/types.js";
import type { SearchHit } from "../providers/you.js";
import { parsePageAge } from "../providers/you.js";
import type { Candidate } from "./search.js";
import { domainOf, matchesAny } from "./text.js";
import type { Claim, LlmProvider, SearchProvider, Source } from "./types.js";

export interface CurrentRelease {
  appId: string;
  appName: string;
  /** As the source states it, e.g. "Inventor 2027.2", "R2026b", "v.2706.1.17". */
  release: string;
  source: { url: string; title: string; published?: string };
  /** "official": an authority domain that isn't a forum; "forum": a user forum; "other": anything else. */
  sourceKind?: SourceKind;
  /** The source's id in the receipts, once it is among the sources. */
  sourceId?: number;
  /** True when the docs the answer cited are for an older release than `release`. */
  olderDocs?: boolean;
  /** Releases detected in the cited docs (titles and URLs), e.g. ["2026"]. */
  citedReleases?: string[];
}

/**
 * Comparable release number: MATLAB-style R2026a/R2026b, or a year (2026, 2027.2 → 2027).
 * Minor updates (2027.2) compare equal to their year: docs for 2027 are current for 2027.2.
 * Builds without a year (v.2706.1.17) return null; no comparison is made.
 */
export function releaseKey(text: string): number | null {
  const keys: number[] = [];
  for (const m of text.matchAll(/\bR(20\d\d)([ab])\b/gi)) keys.push(Number(m[1]) * 10 + (m[2]!.toLowerCase() === "b" ? 5 : 0));
  if (keys.length) return Math.max(...keys);
  for (const m of text.matchAll(/(?<![\d.])(20[12]\d)(?:\.\d+)?(?![\d])/g)) keys.push(Number(m[1]) * 10);
  return keys.length ? Math.max(...keys) : null;
}

/** Human label for a release key, e.g. 20260 → "2026", 20265 → "R2026b". */
export function keyLabel(key: number, matlabStyle: boolean): string {
  const year = Math.floor(key / 10);
  return matlabStyle ? `R${year}${key % 10 === 5 ? "b" : "a"}` : String(year);
}

const ExtractSchema = z.object({ release: z.string().nullable(), resultIndex: z.number().nullable() });

/** The release the model names must literally appear in the result it points to. */
export function checkExtraction(hits: SearchHit[], release: string | null, index: number | null): SearchHit | undefined {
  if (!release || index === null) return undefined;
  const hit = hits[index];
  if (!hit) return undefined;
  const hay = `${hit.title}\n${hit.description}\n${hit.snippets.join("\n")}\n${hit.url}`.toLowerCase();
  return hay.includes(release.toLowerCase()) ? hit : undefined;
}

export type SourceKind = "official" | "forum" | "other";

const FORUM_HOST = /^(forums?|community|communities|discuss|discussions|answers|support-forum)\./;
const FORUM_PATH = /\/(t5|forums?|community|discussions?|threads?|topic)\//i;
const FORUM_SITES = ["reddit.com", "stackexchange.com", "stackoverflow.com", "eng-tips.com", "cnccookbook.com", "grabcad.com"];

/** A user forum or Q&A page, even on an official domain (forums.autodesk.com, mathworks.com/matlabcentral). */
export function isForum(url: string): boolean {
  const host = domainOf(url);
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    /* not a URL */
  }
  return FORUM_HOST.test(host) || FORUM_PATH.test(path) || /matlabcentral/i.test(path) || matchesAny(host, FORUM_SITES);
}

export function sourceKind(url: string, authorityDomains: readonly string[]): SourceKind {
  if (isForum(url)) return "forum";
  return matchesAny(domainOf(url), authorityDomains) ? "official" : "other";
}

/**
 * Prefer an official source for the release: if the model chose a forum or other page and an
 * official result states the same release, cite the official one instead.
 */
export function preferOfficial(hits: SearchHit[], chosen: SearchHit, release: string, authorityDomains: readonly string[]): SearchHit {
  if (sourceKind(chosen.url, authorityDomains) === "official") return chosen;
  return hits.find((h, i) => sourceKind(h.url, authorityDomains) === "official" && checkExtraction(hits, release, i)) ?? chosen;
}

export async function discoverCurrentRelease(
  you: SearchProvider,
  claude: LlmProvider,
  app: AppConfig,
  category: Category,
  now: Date,
): Promise<CurrentRelease | null> {
  const query = `${app.name} latest release ${now.getUTCFullYear()}`;
  const authority = category.authorityDomains;
  // Two searches in parallel: the open web (authority boosted) and official sites only.
  const [open, official] = await Promise.all([
    you.search({
      query,
      count: 8,
      freshness: "year",
      ...(authority.length ? { boostDomains: authority } : {}),
      ...(category.blockedDomains.length ? { excludeDomains: category.blockedDomains } : {}),
    }),
    authority.length ? you.search({ query, count: 6, freshness: "year", includeDomains: authority }).catch(() => []) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const merged = [...official, ...open].filter((h) => !matchesAny(domainOf(h.url), category.blockedDomains) && !seen.has(h.url) && seen.add(h.url));
  // Official results first, then the rest, so indexes and reading order favor them.
  const rank = (h: SearchHit) => ({ official: 0, other: 1, forum: 2 })[sourceKind(h.url, authority)];
  const hits = merged.sort((a, b) => rank(a) - rank(b)).slice(0, 12);
  if (!hits.length) return null;
  const res = await claude.json({
    role: "release",
    system: "You read search results and report the newest released version of one software product. Use only the results.",
    prompt: [
      `Today is ${now.toISOString().slice(0, 10)}. Product: ${app.name}.`,
      "Search results (each labeled official, other or forum):",
      ...hits.map((h, i) => `[${i}] (${sourceKind(h.url, authority)}) ${h.title} | ${h.url} | dated ${h.pageAge ?? "unknown"}\n${[h.description, ...h.snippets].join(" ").slice(0, 400)}`),
      "",
      "Return release: the newest released version, update or build of this product that a result states, copied exactly as written there (for example \"Inventor 2027.2\", \"R2026b\", \"v.2706.1.17\"); and resultIndex: the result that states it. Prefer an official result: use an other or forum result only if no official result states that release. Ignore previews, betas and unrelated products. If no result clearly states it, return nulls.",
    ].join("\n"),
    schema: ExtractSchema,
  });
  const picked = checkExtraction(hits, res.data.release, res.data.resultIndex);
  if (!picked || !res.data.release) return null;
  const release = res.data.release.trim();
  const hit = preferOfficial(hits, picked, release, authority);
  const published = parsePageAge(hit.pageAge)?.toISOString();
  return {
    appId: app.id,
    appName: app.name,
    release,
    source: { url: hit.url, title: hit.title, ...(published ? { published } : {}) },
    sourceKind: sourceKind(hit.url, authority),
  };
}

/** A query for the current release's docs, built from the planner's first query. */
export function releaseQuery(firstQuery: string, app: AppConfig, release: string): string {
  // Remove the app's name as a word only: "matlab.addons.install" must stay intact.
  const name = app.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const topic = firstQuery
    .replace(new RegExp(`(?<![\\w.])${name}(?![\\w.])`, "gi"), "")
    .replace(/(?<![\w.])20\d\d(?![\w.])/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const rel = release.toLowerCase().includes(app.name.toLowerCase().split(" ").at(-1)!.toLowerCase()) ? release : `${app.name} ${release}`;
  return `${rel} ${topic}`.replace(/\s+/g, " ").trim();
}

/** Terms that mark a page as being about the current release, for ranking. */
export function releaseTerms(release: string): string[] {
  const terms = new Set<string>();
  const r = /\bR20\d\d[ab]\b/i.exec(release);
  // MATLAB-style: only the exact release counts (a bare year would also match the a/b sibling).
  if (r) return [r[0].toLowerCase()];
  const y = /(20[12]\d)(\.\d+)?/.exec(release);
  if (y) {
    terms.add(y[0]);
    terms.add(y[1]!);
  }
  if (!terms.size) terms.add(release.toLowerCase());
  return [...terms];
}

/** Make sure the release source is among the sources (so it can be cited): replace the last if absent. */
export function ensureReleaseCandidate(candidates: Candidate[], cr: CurrentRelease, topN: number): Candidate[] {
  if (candidates.some((c) => c.url === cr.source.url)) return candidates;
  const domain = domainOf(cr.source.url);
  const published = cr.source.published ? new Date(cr.source.published) : undefined;
  const c: Candidate = {
    key: cr.source.url,
    url: cr.source.url,
    title: cr.source.title,
    domain,
    description: `Current release: ${cr.release}.`,
    snippets: [`${cr.appName} current release: ${cr.release}.`],
    ...(published ? { published } : {}),
    bestRank: 0,
    foundBy: ["current release"],
    preferred: true,
    authority: false,
    blocked: false,
    score: 0,
  };
  const out = candidates.length >= topN ? candidates.slice(0, topN - 1) : [...candidates];
  return [...out, c];
}

/**
 * After the answer: which releases do the cited docs describe (from their titles and URLs), and are
 * they all older than the current release? The release source itself is excluded.
 */
export function assessCitedDocs(cr: CurrentRelease, cited: Pick<Source, "id" | "url" | "title">[]): { olderDocs: boolean; citedReleases: string[] } {
  const current = releaseKey(cr.release);
  const matlab = /\bR20\d\d[ab]\b/i.test(cr.release);
  const docs = cited.filter((s) => s.url !== cr.source.url);
  const keys = docs.map((s) => releaseKey(`${s.title} ${s.url}`)).filter((k): k is number => k !== null);
  const citedReleases = [...new Set(keys)].sort().map((k) => keyLabel(k, matlab));
  if (current === null || !keys.length) return { olderDocs: false, citedReleases };
  return { olderDocs: Math.max(...keys) < current, citedReleases };
}

/** Does the answer already tell the reader about the current release near the top? */
export function mentionsCurrentRelease(answer: string, cr: CurrentRelease): boolean {
  const head = answer.slice(0, 600).toLowerCase();
  return releaseTerms(cr.release).some((t) => head.includes(t.toLowerCase())) || head.includes(cr.release.toLowerCase());
}

/**
 * If the cited docs are older and the answer didn't say so, prepend a cited note, shifting claim
 * spans so underlines still line up. Returns the new text and claims.
 */
export function prependOlderDocsNote(answer: string, claims: Claim[], cr: CurrentRelease, citedReleases: string[]): { text: string; claims: Claim[]; note: string } {
  const cite = cr.sourceId !== undefined ? ` [${cr.sourceId}]` : "";
  const older = citedReleases.length ? citedReleases.join(" and ") : "an older release";
  const name = cr.release.toLowerCase().includes(cr.appName.toLowerCase().split(" ").at(-1)!.toLowerCase()) ? cr.release : `${cr.appName} ${cr.release}`;
  const note = `${name} is the current release${cite}; the steps below come from ${older} documentation and may differ slightly.`;
  const shift = note.length + 2;
  return {
    text: `${note}\n\n${answer}`,
    claims: claims.map((c) => (c.span ? { ...c, span: { start: c.span.start + shift, end: c.span.end + shift } } : c)),
    note,
  };
}
