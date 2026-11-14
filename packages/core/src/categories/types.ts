export type FreshnessWindow = "day" | "week" | "month" | "year" | "any";

/** PLAN.md §3. Adding a category means adding a file and listing it in registry.ts. */
export interface Category {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Expert lens for the answer step. */
  persona: string;
  /** Default search window, also the window that counts as "fresh" for confidence. */
  freshness: FreshnessWindow;
  /** Sent to You.com as `boost_domains` and boosted again in our ranking. Subdomains match. */
  preferredDomains: string[];
  /** Sent to You.com as `exclude_domains` and penalized in our ranking. */
  blockedDomains: string[];
  queryHints: string[];
  safety?: string;
  /** Who to point people to when Studyhall can't help (health, legal, finance). */
  professional?: string;
  /** Refuse to answer with fewer usable sources than this. */
  minSources: number;
  /** Example questions for the UI. Also the Phase 2 manual test set. */
  starters: string[];
}

/** Low-quality or paywalled hosts blocked in every category. */
export const BASE_BLOCKED_DOMAINS = [
  "pinterest.com",
  "quora.com",
  "answers.com",
  "ehow.com",
  "chegg.com",
  "coursehero.com",
  "scribd.com",
  "slideshare.net",
];
