import type { PageContent } from "../providers/you.js";
import type { Candidate } from "./search.js";
import { cleanMarkdown, selectRelevant } from "./text.js";
import type { ReadSource, SearchProvider } from "./types.js";

/** A source needs at least this much text to count as usable evidence. */
export const MIN_USABLE_CHARS = 80;

export interface ReadOptions {
  readK: number;
  /** Per-page crawl timeout for the Contents API. */
  crawlTimeoutSec: number;
  perSourceChars: number;
  totalChars: number;
}

function snippetText(c: Candidate): string {
  return [c.description, ...c.snippets].map((s) => s.trim()).filter(Boolean).join("\n").trim();
}

/**
 * PLAN.md §4 step 3: read the top K with the Contents API, keep the chunks most relevant to the
 * question, fall back to search snippets on failure (and say why), and cap total context.
 */
export async function readSources(
  you: SearchProvider,
  candidates: Candidate[],
  question: string,
  opts: ReadOptions,
): Promise<{ sources: ReadSource[]; contentsError?: string }> {
  const toRead = candidates.slice(0, opts.readK);
  let pages: PageContent[] = [];
  let contentsError: string | undefined;
  if (toRead.length) {
    try {
      pages = await you.contents(toRead.map((c) => c.url), { crawlTimeoutSec: opts.crawlTimeoutSec });
    } catch (err) {
      contentsError = err instanceof Error ? err.message : String(err);
    }
  }

  const sources: ReadSource[] = candidates.map((c, i) => {
    const page = i < opts.readK ? pages[i] : undefined;
    const base = {
      id: i + 1,
      url: c.url,
      title: c.title,
      domain: c.domain,
      ...(c.published ? { published: c.published.toISOString() } : {}),
      score: Math.round(c.score * 100) / 100,
      foundBy: c.foundBy,
      preferred: c.preferred,
      authority: c.authority,
      cited: false,
    };
    if (page?.status === "ok" && page.markdown) {
      const text = selectRelevant(cleanMarkdown(page.markdown), `${question} ${c.title}`, opts.perSourceChars);
      if (text.length >= MIN_USABLE_CHARS) return { ...base, readStatus: "full", text };
    }
    const readNote =
      i >= opts.readK
        ? "snippets only (ranked below the pages we read)"
        : contentsError
          ? "snippets only (contents API error)"
          : page?.status === "missing"
            ? "snippets only (page not returned by the contents API)"
            : "snippets only (page could not be crawled)";
    return { ...base, readStatus: "snippets", readNote, text: snippetText(c).slice(0, opts.perSourceChars) };
  });

  // Cap total context, trimming from the lowest-ranked sources first.
  let total = sources.reduce((n, s) => n + s.text.length, 0);
  for (let i = sources.length - 1; i >= 0 && total > opts.totalChars; i--) {
    const s = sources[i]!;
    const keep = Math.max(0, s.text.length - (total - opts.totalChars));
    total -= s.text.length - keep;
    s.text = s.text.slice(0, keep);
  }

  return { sources, ...(contentsError ? { contentsError } : {}) };
}

export function usableSources(sources: ReadSource[]): ReadSource[] {
  return sources.filter((s) => s.text.trim().length >= MIN_USABLE_CHARS);
}
