/**
 * Code in answers is checked deterministically: every function or command the code calls must
 * appear in a cited source, or it becomes a "partial" claim noted "not found in sources".
 */
import { citedIds } from "./text.js";
import type { Claim, ReadSource } from "./types.js";

export interface CodeBlock {
  lang: string;
  code: string;
  /** Offsets of the code body (inside the fences) in the answer. */
  start: number;
  end: number;
}

const FENCE = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;

export function extractCodeBlocks(answer: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const m of answer.matchAll(FENCE)) {
    const bodyStart = m.index! + m[0].indexOf("\n") + 1;
    blocks.push({ lang: m[1]!.toLowerCase(), code: m[2]!, start: bodyStart, end: bodyStart + m[2]!.length });
  }
  return blocks;
}

/** Answer text with fenced code removed, so prose checks never see code. */
export function stripCode(answer: string): string {
  return answer.replace(FENCE, "");
}

const KEYWORDS = new Set(
  (
    "if elseif else end for while do switch case otherwise try catch function return break continue global persistent " +
    "classdef properties methods events enumeration parfor spmd arguments import from def class lambda with as in not and or " +
    "print true false none null nil let const var new this self"
  ).split(" "),
);

/** Remove comments and string literals (MATLAB, Python, C-like). */
function scrub(code: string): string {
  return code
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/(^|[\s=(,;[{])'(?:[^'\n]|'')*'/g, "$1''")
    .replace(/%\{[\s\S]*?%\}/g, "")
    .replace(/(^|\s)(%|#|\/\/).*$/gm, "$1");
}

/**
 * Functions and commands the code calls: `name(` calls (dotted names kept whole, e.g.
 * matlab.addons.install) and MATLAB command syntax at the start of a line (`mpminstall pkg`).
 * Names the code itself assigns or defines are excluded.
 */
export function calledFunctions(code: string, lang = ""): string[] {
  const clean = scrub(code);
  const assigned = new Set<string>();
  for (const m of clean.matchAll(/(?:^|[;\n])\s*\[?\s*([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*)\s*\]?\s*=(?!=)/g)) {
    for (const n of m[1]!.split(",")) assigned.add(n.trim().split(".")[0]!);
  }
  for (const m of clean.matchAll(/\bfunction\s+(?:\[?[\w,\s]*\]?\s*=\s*)?([A-Za-z_]\w*)/g)) assigned.add(m[1]!);
  for (const m of clean.matchAll(/\bdef\s+([A-Za-z_]\w*)/g)) assigned.add(m[1]!);

  const names: string[] = [];
  const add = (n: string) => {
    const root = n.split(".")[0]!;
    if (!KEYWORDS.has(n.toLowerCase()) && !assigned.has(root) && !names.includes(n)) names.push(n);
  };
  for (const m of clean.matchAll(/(?<![\w.])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/g)) add(m[1]!);
  if (lang === "matlab" || lang === "m" || lang === "") {
    for (const m of clean.matchAll(/^\s*([A-Za-z_]\w*)[ \t]+(?![=(\s])[^\n=]*$/gm)) add(m[1]!);
  }
  return names;
}

const wordRe = (name: string) => new RegExp(`(?<![\\w.])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`);

/**
 * One claim per called function per code block: supported when a cited source contains the name,
 * otherwise partial ("Not found in sources", naming any uncited source that does mention it).
 */
export function checkCode(answer: string, sources: ReadSource[]): Claim[] {
  const blocks = extractCodeBlocks(answer);
  if (!blocks.length) return [];
  const cited = new Set(citedIds(stripCode(answer)));
  const citedSources = sources.filter((s) => cited.has(s.id));
  const claims: Claim[] = [];
  for (const b of blocks) {
    for (const name of calledFunctions(b.code, b.lang)) {
      const re = wordRe(name);
      const inCited = citedSources.filter((s) => re.test(s.text));
      const offset = b.code.search(wordRe(name));
      const span = offset >= 0 ? { start: b.start + offset, end: b.start + offset + name.length } : null;
      if (inCited.length) {
        const s = inCited[0]!;
        const at = s.text.search(re);
        claims.push({
          kind: "code",
          text: name,
          sourceIds: inCited.map((x) => x.id),
          verdict: "supported",
          note: `Appears in source ${inCited.map((x) => x.id).join(", ")}.`,
          evidence: s.text.slice(Math.max(0, at - 60), at + name.length + 60).replace(/\s+/g, " ").trim(),
          span,
        });
      } else {
        const elsewhere = sources.filter((x) => !cited.has(x.id) && re.test(x.text)).map((x) => x.id);
        claims.push({
          kind: "code",
          text: name,
          sourceIds: [],
          verdict: "partial",
          note: elsewhere.length ? `Not found in the cited sources (it appears in uncited source ${elsewhere.join(", ")}).` : "Not found in sources.",
          evidence: "",
          span,
        });
      }
    }
  }
  return claims;
}
