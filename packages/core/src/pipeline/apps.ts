/**
 * App detection and query disambiguation for version-aware categories (Engineering Software).
 * Pure functions over the category's `apps` config, so the rules are testable without a model.
 */
import type { AppConfig, Category } from "../categories/types.js";

export type AppHow = "selected" | "named" | "unspecified";

export interface ResolvedApps {
  apps: AppConfig[];
  how: AppHow;
}

const re = (src: string) => new RegExp(src, "i");
const matchesAny = (text: string, sources: string[] = []) => sources.some((s) => re(s).test(text));

/**
 * Which app(s) a question is about. A selected app (chip) wins. Otherwise strong aliases count
 * outright, and a weak alias (bare "Fusion") counts only if no other app matched strongly — so
 * "sensor fusion in MATLAB" is MATLAB, and "fillet in Fusion" is Autodesk Fusion.
 */
export function resolveApps(question: string, category: Category, selectedId?: string): ResolvedApps {
  const apps = category.apps ?? [];
  const selected = selectedId ? apps.find((a) => a.id === selectedId) : undefined;
  if (selected) return { apps: [selected], how: "selected" };
  const strong = apps.filter((a) => matchesAny(question, a.aliases));
  const weak = apps.filter((a) => !strong.includes(a) && matchesAny(question, a.weakAliases));
  const found = strong.length ? strong : weak;
  return found.length ? { apps: found, how: "named" } : { apps: [], how: "unspecified" };
}

/** Map a free-text software name (from the planner) to an app, if it is one. */
export function appFromName(name: string | null | undefined, category: Category): AppConfig | undefined {
  if (!name) return undefined;
  return (category.apps ?? []).find((a) => a.name.toLowerCase() === name.toLowerCase() || matchesAny(name, [...a.aliases, ...(a.weakAliases ?? [])]));
}

/**
 * The category as search should see it: exclusions of the single resolved app added to the
 * blocked list (and removed from the boost list, which You.com would otherwise contradict).
 * With several apps named (a comparison), nothing extra is excluded.
 */
export function searchCategory(category: Category, resolved: ResolvedApps): Category {
  if (resolved.apps.length !== 1) return category;
  const exclude = resolved.apps[0]!.excludeDomains ?? [];
  if (!exclude.length) return category;
  const isExcluded = (d: string) => exclude.some((x) => d === x || d.endsWith(`.${x}`));
  return {
    ...category,
    blockedDomains: [...new Set([...category.blockedDomains, ...exclude])],
    preferredDomains: category.preferredDomains.filter((d) => !isExcluded(d)),
    authorityDomains: category.authorityDomains.filter((d) => !isExcluded(d)),
  };
}

const RECENT = /\b(latest|newest|new|what's new|whats new|changed|changes|update|updates|release|released|current|this month|this year)\b/i;

export function isRecencyQuestion(question: string): boolean {
  return RECENT.test(question);
}

/** Replace bare app names with their unambiguous name ("Fusion 360" / "fusion" → "Autodesk Fusion"). */
export function canonicalize(query: string, app: AppConfig): string {
  if (!app.rewrite) return query;
  return query.replace(new RegExp(app.rewrite, "gi"), app.name).replace(/\s+/g, " ").trim();
}

/**
 * Deterministic query clean-up for version-aware categories: canonical app names, every query
 * names an app (when one is known), and recent-change questions include "release notes" + year.
 */
export function disambiguateQueries(queries: string[], question: string, resolved: ResolvedApps, now: Date): string[] {
  const year = String(now.getUTCFullYear());
  const single = resolved.apps.length === 1 ? resolved.apps[0]! : undefined;
  // "sensor fusion" is MATLAB vocabulary: never rewrite it into "Autodesk Fusion".
  let out = queries.map((q) => {
    let r = q;
    for (const app of resolved.apps) r = canonicalize(r, app);
    if (single && !r.toLowerCase().includes(single.name.toLowerCase())) r = `${single.name} ${r}`;
    return r;
  });
  if (single && isRecencyQuestion(question) && !out.some((q) => /release notes|what's new/i.test(q))) {
    const extra = `${single.name} release notes ${year}`;
    out = out.length >= 4 ? [...out.slice(0, 3), extra] : [...out, extra];
  }
  return [...new Set(out)];
}

/** One line for the answer and notes prompts describing which software the question is about. */
export function softwareLine(resolved: ResolvedApps, version: string | null): string {
  const names = resolved.apps.map((a) => a.name).join(" and ");
  const v = version ? ` The user mentioned this version or release: ${version}.` : "";
  if (resolved.how === "selected") return `The user selected ${names}.${v}`;
  if (resolved.how === "named") return `The question is about ${names}.${v}`;
  return `No specific app was named.${v} Say which app you assumed from the sources, and invite the user to pick another app if they meant a different one.`;
}
