/**
 * Plant one factual error in a sentence, keeping its citation markers, to test that verify catches
 * it. Used by scripts/planted.ts and the regression tests; never by the pipeline.
 */

export type PlantKind = "number" | "negation" | "entity";

const protect = (s: string) => s.replace(/\[\d+]/g, (m) => `${m.slice(1, -1)}`);
const restore = (s: string) => s.replace(/(\d+)/g, "[$1]");

/**
 * Change the first number. Years move back two; days of the month move back a week; other numbers
 * change enough to be clearly wrong but still plausible.
 */
export function plantNumberError(sentence: string): string | undefined {
  const body = protect(sentence);
  const m = body.match(/(?<![\d])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\d])/);
  if (!m || m.index === undefined) return undefined;
  const raw = m[1]!;
  const n = Number(raw.replace(/,/g, ""));
  let next: string;
  if (/^(19|20)\d{2}$/.test(raw)) next = String(n - 2);
  else if (raw.includes(".")) next = (n + 1.5).toFixed(raw.split(".")[1]!.length);
  else if (raw.includes(",")) next = Math.round(n * 1.4).toLocaleString("en-US");
  else next = String(n < 10 ? n + 3 : n <= 31 ? n - 7 : Math.round(n * 1.4));
  return restore(body.slice(0, m.index) + next + body.slice(m.index + raw.length));
}

/** Flip the first recommendation/requirement verb into its negation. */
const NEGATIONS: [RegExp, string][] = [
  [/\bdoes not recommend\b/i, "recommends"],
  [/\bis not recommended\b/i, "is recommended"],
  [/\brecommends\b/, "does not recommend"],
  [/\brecommend\b/, "do not recommend"],
  [/\b(is|are) recommended\b/, "$1 not recommended"],
  [/\b(is|are) required\b/, "$1 not required"],
  [/\brequires\b/, "does not require"],
  [/\b(need|needs) to\b/, "do not need to"],
  [/\b(is|are) allowed\b/, "$1 not allowed"],
  [/\b(should|must|will|can)\b(?! not)/, "$1 not"],
];

export function plantNegation(sentence: string): string | undefined {
  const body = protect(sentence);
  for (const [re, rep] of NEGATIONS) {
    if (re.test(body)) return restore(body.replace(re, rep));
  }
  return undefined;
}

/** Swap a well-known organization or product for a plausible wrong one. */
const ENTITY_SWAPS: [string, string][] = [
  ["CDC", "WHO"],
  ["Centers for Disease Control and Prevention", "World Health Organization"],
  ["WHO", "CDC"],
  ["FDA", "USDA"],
  ["USDA", "FDA"],
  ["Federal Reserve", "European Central Bank"],
  ["FOMC", "ECB Governing Council"],
  ["Federal Open Market Committee", "European Central Bank's Governing Council"],
  ["IRS", "Social Security Administration"],
  ["Moderna", "Novavax"],
  ["Pfizer", "Moderna"],
  ["NASA", "ESA"],
  ["Apple", "Samsung"],
  ["Microsoft", "Google"],
  ["Intel", "AMD"],
  ["Python", "Ruby"],
  ["TSA", "CBP"],
  ["Supreme Court", "Court of Appeals"],
];

export function plantEntityError(sentence: string): string | undefined {
  const body = protect(sentence);
  for (const [from, to] of ENTITY_SWAPS) {
    const re = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(body)) return restore(body.replace(re, to));
  }
  return undefined;
}

export const PLANTERS: Record<PlantKind, (s: string) => string | undefined> = {
  number: plantNumberError,
  negation: plantNegation,
  entity: plantEntityError,
};
