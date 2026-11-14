import type { Category } from "../categories/types.js";
import { humanAge, WINDOW_MS } from "./text.js";
import type { Claim, Confidence, Source } from "./types.js";

/**
 * PLAN.md §4 step 6, with the gaps filled in (see DECISIONS.md):
 * - High: every remaining claim supported, >= 2 distinct cited domains, newest cited source inside
 *   the category's freshness window.
 * - Medium: no remaining claim unsupported, but High isn't met (partial claims, one domain, or stale).
 * - Low: any unsupported claim remains, no claims were checked, or nothing was cited.
 * Claims deleted by the repair pass don't count.
 */
export function computeConfidence(
  claims: Claim[],
  cited: Source[],
  category: Category,
  now: Date,
): { confidence: Confidence; reasons: string[] } {
  const live = claims.filter((c) => c.repair !== "removed");
  const reasons: string[] = [];
  if (live.length === 0) return { confidence: "low", reasons: ["No checked claims."] };
  if (cited.length === 0) return { confidence: "low", reasons: ["Nothing was cited."] };

  const unsupported = live.filter((c) => c.verdict === "unsupported").length;
  const partial = live.filter((c) => c.verdict === "partial").length;
  const domains = new Set(cited.map((s) => s.domain));
  const newest = newestDate(cited);
  const fresh =
    category.freshness === "any" || (newest !== undefined && now.getTime() - newest.getTime() <= WINDOW_MS[category.freshness]);

  if (unsupported) reasons.push(`${unsupported} claim${unsupported === 1 ? "" : "s"} unsupported.`);
  if (partial) reasons.push(`${partial} claim${partial === 1 ? "" : "s"} only partly supported.`);
  if (domains.size < 2) reasons.push("Only one domain cited.");
  if (!fresh) reasons.push(newest ? `Newest cited source is older than one ${category.freshness}.` : "Cited sources have no dates.");

  if (unsupported) return { confidence: "low", reasons };
  if (!partial && domains.size >= 2 && fresh) return { confidence: "high", reasons: ["All claims supported by 2+ fresh, independent domains."] };
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
