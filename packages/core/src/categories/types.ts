export type FreshnessWindow = "day" | "week" | "month" | "year" | "any";

/** A software product a version-aware category covers. Drives app detection and query wording. */
export interface AppConfig {
  id: string;
  /** Short chip label, e.g. "Fusion". */
  label: string;
  /** Unambiguous name used in queries and prompts, e.g. "Autodesk Fusion". */
  name: string;
  /** Case-insensitive regex sources that mean the question is about this app. */
  aliases: string[];
  /** Aliases that alone are ambiguous (bare "Fusion"); they lose to another app's strong match. */
  weakAliases?: string[];
  /** Regex source for name variants to rewrite to `name` in queries (bare "Fusion", "Fusion 360"). */
  rewrite?: string;
  /** Domains to exclude from search when this app is the only subject (name collisions). */
  excludeDomains?: string[];
}

/** PLAN.md §3. Adding a category means adding a file and listing it in registry.ts. */
export interface Category {
  id: string;
  name: string;
  emoji: string;
  /** Lucide icon name (kebab-case) shown in the UI; emoji stays for the CLI. */
  icon: string;
  description: string;
  /** Expert lens for the answer step. */
  persona: string;
  /** Default search window, also the window that counts as "fresh" for confidence. */
  freshness: FreshnessWindow;
  /** Sent to You.com as `boost_domains` and boosted again in our ranking. Subdomains match. */
  preferredDomains: string[];
  /**
   * Official and primary sources only (agencies, regulators, leagues, publishers, standards bodies).
   * A subset of preferredDomains. Used only by the confidence rule that lets a single domain earn
   * High; ranking uses preferredDomains.
   */
  authorityDomains: string[];
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
  /**
   * Answers must match a specific software release: the planner extracts software and version, the
   * answer opens with the release its sources describe, and code is checked against the sources.
   */
  versionAware?: boolean;
  /** Apps the user can pick (chips) and that queries are disambiguated against. */
  apps?: AppConfig[];
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
