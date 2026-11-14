/**
 * App detection and query disambiguation for version-aware categories (Engineering Software).
 * Pure functions over the category's `apps` config, so the rules are testable without a model.
 */
import type { AppConfig, Category } from "../categories/types.js";
import { matchesAny as onDomain } from "./text.js";

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
 * The category as search should see it, for one resolved app: only that app's vendor sites stay
 * boosted and authoritative, and every other app's vendor sites (plus the app's own extra
 * exclusions) are blocked. A SOLIDWORKS question doesn't rank Autodesk pages, and a Fusion question
 * doesn't rank SOLIDWORKS pages. With no app (a generic question) or several apps (a comparison),
 * the category-wide lists are unchanged.
 */
export function searchCategory(category: Category, resolved: ResolvedApps): Category {
  if (resolved.apps.length !== 1) return category;
  const app = resolved.apps[0]!;
  const own = app.domains ?? [];
  const otherVendors = (category.apps ?? []).flatMap((a) => a.domains ?? []).filter((d) => !onDomain(d, own));
  const exclude = [...new Set([...otherVendors, ...(app.excludeDomains ?? [])])];
  if (!own.length && !exclude.length) return category;
  const keep = (d: string) => (!own.length || onDomain(d, own)) && !onDomain(d, exclude);
  return {
    ...category,
    blockedDomains: [...new Set([...category.blockedDomains, ...exclude])],
    preferredDomains: category.preferredDomains.filter(keep),
    authorityDomains: category.authorityDomains.filter(keep),
  };
}

/** A version written right after the app's name: "SOLIDWORKS 2027", "Inventor 2027.2", "FreeCAD 1.0", "MATLAB R2026a". */
const VERSION_AFTER_NAME = String.raw`\s+(R20\d\d[ab]|v\.?\s?\d+(?:\.\d+)+|20\d\d(?:\.\d+)*|\d+(?:\.\d+)+)(?![\w.])`;
/** Versions that need no app name next to them: MATLAB releases and Fusion builds. */
const VERSION_ANYWHERE = /(?<![\w.])(R20\d\d[ab]|v\.\d{3,}(?:\.\d+)+)(?![\w.])/i;

/**
 * The version the question text names for this app, if any, found without a model so the
 * current-release lookup can be skipped before it spends searches. Conservative: a miss only means
 * the lookup starts as before (the planner's version still cancels it); a date ("as of November
 * 2026") or a bare number ("Fusion 360") isn't a version.
 */
export function versionInQuestion(question: string, app: AppConfig): string | null {
  const names = [...app.aliases, ...(app.weakAliases ?? []), app.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")];
  const afterName = new RegExp(`(?:${names.join("|")})${VERSION_AFTER_NAME}`, "i").exec(question);
  return afterName?.[1] ?? VERSION_ANYWHERE.exec(question)?.[1] ?? null;
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
