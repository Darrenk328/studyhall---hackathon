/** Pure text helpers: URLs, keywords, chunking, citations, ages. */

/** Query params that never change page content: analytics/referral tags (utm, utm_*, CDC's CDC_AA_refVal, …). */
const TRACKING_PARAMS = /^(utm(_.*)?|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref|ref_src|cdc_aa_refval|_ga|_gl|igshid|si|s_tid)$/i;

/** Sites that serve the same page from country subdomains (in.mathworks.com, uk.mathworks.com). */
const COUNTRY_MIRRORS = ["mathworks.com"];

/**
 * Identity for dedupe: lower-case host without www or a country-mirror prefix, no fragment, no
 * tracking params, no trailing slash.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase().replace(/^www\./, "");
    const mirror = /^[a-z]{2}\.(.+)$/.exec(host);
    if (mirror && COUNTRY_MIRRORS.includes(mirror[1]!)) host = mirror[1]!;
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}${query}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True when `host` is `domain` or a subdomain of it. */
export function matchesDomain(host: string, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return host === d || host.endsWith(`.${d}`);
}

const SECOND_LEVEL = new Set(["co", "com", "gov", "ac", "org", "net", "edu", "or", "ne", "go"]);

/**
 * The site a host belongs to, for counting independent sources: uk.mathworks.com and mathworks.com
 * are one site, as are help.autodesk.com and forums.autodesk.com. Approximates the registrable
 * domain (last two labels, or three for co.uk-style suffixes).
 */
export function siteOf(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const take = labels.at(-1)!.length === 2 && SECOND_LEVEL.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-take).join(".");
}

export function matchesAny(host: string, domains: readonly string[]): boolean {
  return domains.some((d) => matchesDomain(host, d));
}

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can did do does for from has have how i if in into is it its latest " +
    "me most my new now of on or right should so than that the their them there these this to was were what " +
    "when where which who whom why will with would you your current currently recent today"
  ).split(" "),
);

export function keywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*[a-z0-9]|[a-z0-9]/g) ?? [];
  return [...new Set(words.filter((w) => !STOPWORDS.has(w) && w.length > 1))];
}

/** Remove markdown noise that wastes context: images, link targets, html tags, repeated blank lines. */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split into ~targetChars chunks on paragraph boundaries (long paragraphs split on sentences). */
export function chunkText(text: string, targetChars = 800): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= targetChars * 1.5) {
      pieces.push(p);
      continue;
    }
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      for (let i = 0; i < sentence.length; i += targetChars) pieces.push(sentence.slice(i, i + targetChars));
    }
  }
  const chunks: string[] = [];
  let cur = "";
  for (const piece of pieces) {
    if (cur && cur.length + piece.length + 2 > targetChars) {
      chunks.push(cur);
      cur = piece;
    } else {
      cur = cur ? `${cur}\n\n${piece}` : piece;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/**
 * Keep the chunks most relevant to the question (keyword overlap), always including the lead chunk,
 * up to maxChars. Returned in original order so the excerpt still reads naturally.
 */
export function selectRelevant(text: string, question: string, maxChars: number): string {
  const chunks = chunkText(text);
  if (chunks.length === 0) return "";
  const terms = keywords(question);
  const scored = chunks.map((c, i) => {
    const lower = c.toLowerCase();
    const hits = terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    return { i, c, score: i === 0 ? Number.POSITIVE_INFINITY : hits };
  });
  const picked: typeof scored = [];
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (s.score === 0 && picked.length > 0) break;
    if (used + s.c.length > maxChars) {
      if (picked.length === 0) picked.push({ ...s, c: s.c.slice(0, maxChars) });
      continue;
    }
    picked.push(s);
    used += s.c.length + 2;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((s) => s.c)
    .join("\n\n…\n\n");
}

/** Matches [1], [1, 3], [1,3], [ 2 ] — but not markdown links like [text](url). */
const CITATION = /\[(\s*\d+(?:\s*,\s*\d+)*\s*)](?!\()/g;

export function citedIds(text: string): number[] {
  const ids = new Set<number>();
  for (const m of text.matchAll(CITATION)) for (const n of m[1]!.split(",")) ids.add(Number(n.trim()));
  return [...ids].sort((a, b) => a - b);
}

/** Drop citation numbers that don't match a source. Returns the cleaned text and what was removed. */
export function sanitizeCitations(text: string, validIds: ReadonlySet<number>): { text: string; removed: number[] } {
  const removed = new Set<number>();
  const cleaned = text.replace(CITATION, (_m, inner: string) => {
    const ids = inner.split(",").map((n) => Number(n.trim()));
    const keep = ids.filter((n) => validIds.has(n));
    for (const n of ids) if (!validIds.has(n)) removed.add(n);
    return keep.length ? keep.map((n) => `[${n}]`).join("") : "";
  });
  // Tidy spaces left before punctuation by removed markers.
  const tidy = removed.size ? cleaned.replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ") : cleaned;
  return { text: tidy, removed: [...removed].sort((a, b) => a - b) };
}

/** Lower-case, citation-free, punctuation-free form for comparing sentences. */
export const squash = (s: string) => s.toLowerCase().replace(/\[\d+]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

/**
 * Split answer text into sentences with offsets. A sentence ends at . ! or ? (plus any closing
 * quotes and trailing citation markers) followed by whitespace, or at a line break. Decimals like
 * "3.75" don't split. Fragments under two words (list markers like "1.") are merged forward.
 */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const boundary = /[.!?]["')\]]*(?:\s*\[\d+(?:\s*,\s*\d+)*])*(?=\s)/g;
  for (const line of text.matchAll(/[^\n]+/g)) {
    const lineStart = line.index!;
    const cuts = [...line[0].matchAll(boundary)].map((m) => m.index! + m[0].length);
    let prev = 0;
    let carry: number | undefined;
    for (const cut of [...cuts, line[0].length]) {
      const raw = line[0].slice(prev, cut);
      const lead = raw.length - raw.trimStart().length;
      const trimmed = raw.trim();
      const start = carry ?? lineStart + prev + lead;
      if (trimmed && trimmed.split(/\s+/).length < 2 && cut < line[0].length) {
        carry ??= start;
      } else if (trimmed) {
        const end = lineStart + prev + lead + trimmed.length;
        out.push({ text: text.slice(start, end), start, end });
        carry = undefined;
      }
      prev = cut;
    }
  }
  return out;
}

/** Find `needle` in `haystack`: exact first, then tolerant of whitespace differences. */
export function locateSpan(haystack: string, needle: string): { start: number; end: number } | null {
  const n = needle.trim();
  if (!n) return null;
  const exact = haystack.indexOf(n);
  if (exact >= 0) return { start: exact, end: exact + n.length };
  const pattern = n
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const m = new RegExp(pattern).exec(haystack);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

export const WINDOW_MS = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 31 * 86_400_000,
  year: 366 * 86_400_000,
} as const;

export function humanAge(ms: number): string {
  const units: [number, string][] = [
    [365 * 86_400_000, "year"],
    [30 * 86_400_000, "month"],
    [7 * 86_400_000, "week"],
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  if (ms < 60_000) return "just now";
  for (const [size, name] of units) {
    if (ms >= size) {
      const n = Math.floor(ms / size);
      return `${n} ${name}${n === 1 ? "" : "s"} old`;
    }
  }
  return "just now";
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
