import type { Category } from "../categories/types.js";
import { humanAge, normalizeUrl, siteOf, WINDOW_MS } from "./text.js";
import type { Claim, Confidence, Source } from "./types.js";

/**
 * PLAN.md §4 step 6, recalibrated after the Phase 2 runs (see DECISIONS.md). Only claims in the
 * final answer count, and "meta" claims (about the sources themselves) are ignored.
 * - High: every graded claim supported, the newest cited source inside the category's freshness
 *   window, and the sources are independent enough: 2+ distinct domains, or one domain on the
 *   category's authority list (official/primary sources) with 2+ distinct pages cited (CDC alone is
 *   the authority for CDC guidance).
 * - Medium: nothing unsupported, but High isn't met (partial claims, a single non-authority domain or
 *   page, stale or undated sources).
 * - Low: an unsupported claim remains, nothing could be graded, or nothing was cited.
 */
export function computeConfidence(
  claims: Claim[],
  cited: Source[],
  category: Category,
  now: Date,
): { confidence: Confidence; reasons: string[] } {
  const graded = claims.filter((c) => c.verdict !== "meta");
  const reasons: string[] = [];
  if (graded.length === 0) return { confidence: "low", reasons: ["No gradable claims."] };
  if (cited.length === 0) return { confidence: "low", reasons: ["Nothing was cited."] };

  const unsupported = graded.filter((c) => c.verdict === "unsupported").length;
  const partial = graded.filter((c) => c.verdict === "partial").length;
  // Independence counts sites, so regional mirrors and subdomains of one publisher count once.
  const domains = new Set(cited.map((s) => siteOf(s.domain)));
  const pages = new Set(cited.map((s) => normalizeUrl(s.url)));
  const authority = domains.size === 1 && cited.every((s) => s.authority) && pages.size >= 2;
  const independent = domains.size >= 2 || authority;
  const newest = newestDate(cited);
  const fresh =
    category.freshness === "any" || (newest !== undefined && now.getTime() - newest.getTime() <= WINDOW_MS[category.freshness]);

  if (unsupported) reasons.push(`${unsupported} claim${unsupported === 1 ? "" : "s"} unsupported.`);
  if (partial) reasons.push(`${partial} claim${partial === 1 ? "" : "s"} only partly supported.`);
  if (!independent) {
    reasons.push(
      domains.size === 1 && pages.size < 2
        ? "Only one page cited."
        : `Only one domain cited (${[...domains][0]}), and it isn't an official or primary ${category.name} source.`,
    );
  }
  if (!fresh) reasons.push(newest ? `Newest cited source is older than one ${category.freshness}.` : "Cited sources have no dates.");

  // An answer that is mostly about what the sources don't cover isn't a confident answer.
  const meta = claims.filter((c) => c.verdict === "meta").length;
  const mostlyMeta = meta > graded.length;
  if (mostlyMeta) reasons.push("Most of the answer is about what the sources do or don't cover.");

  if (unsupported) return { confidence: "low", reasons };
  if (!partial && independent && fresh && !mostlyMeta) {
    return {
      confidence: "high",
      reasons: [
        authority
          ? `All claims supported by ${pages.size} pages from ${[...domains][0]}, an official ${category.name} source.`
          : `All claims supported by ${domains.size} independent domains.`,
      ],
    };
  }
  return { confidence: "medium", reasons };
}

export function newestDate(sources: Source[]): Date | undefined {
  let best: Date | undefined;
  for (const s of sources) {
    if (!s.published) continue;
    const d = new Date(s.published);
    if (!best || d > best) best = d;
  }
  return best;
}

export function sourceAge(sources: Source[], now: Date): { ms?: number; human?: string } {
  const newest = newestDate(sources);
  if (!newest) return {};
  const ms = Math.max(0, now.getTime() - newest.getTime());
  return { ms, human: humanAge(ms) };
}
