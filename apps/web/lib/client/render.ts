/**
 * Turn answer text plus claim spans into blocks of inline atoms the UI can render: plain text,
 * citation chips, and the claim each run belongs to (for verdict underlines). Pure and testable.
 */
import type { Claim } from "@studyhall/core";

export type Atom = { kind: "text"; text: string; claim: number } | { kind: "cite"; id: number; claim: number };

export type Block =
  | {
      kind: "p" | "ul" | "ol";
      /** For p: one item. For lists: one item per list entry. */
      items: Atom[][];
    }
  /** A fenced code block; `start`/`end` are the offsets of the code body in the answer. */
  | { kind: "code"; lang: string; code: string; start: number; end: number };

const LIST_ITEM = /^(\s*)([-*•]|\d+[.)])\s+/;

/** Only claims whose span still points at their own text in this answer can be underlined. */
export function validClaims(text: string, claims: Claim[]): Claim[] {
  return claims.filter((c) => c.span && c.span.end <= text.length && text.slice(c.span.start, c.span.end) === c.text);
}

function claimIndexAt(claims: Claim[], pos: number): number {
  return claims.findIndex((c) => c.span!.start <= pos && pos < c.span!.end);
}

/** Atoms for text[start, end): citations split out, text split at claim boundaries. */
export function inlineAtoms(text: string, start: number, end: number, claims: Claim[]): Atom[] {
  const cuts = new Set<number>([start, end]);
  for (const c of claims) {
    if (c.span!.start > start && c.span!.start < end) cuts.add(c.span!.start);
    if (c.span!.end > start && c.span!.end < end) cuts.add(c.span!.end);
  }
  const cites: { start: number; end: number; id: number }[] = [];
  const re = /\[(\d+)]/g;
  re.lastIndex = start;
  for (let m = re.exec(text); m && m.index < end; m = re.exec(text)) {
    if (m.index + m[0].length > end) break;
    cites.push({ start: m.index, end: m.index + m[0].length, id: Number(m[1]) });
    cuts.add(m.index);
    cuts.add(m.index + m[0].length);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const atoms: Atom[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a === b) continue;
    const claim = claimIndexAt(claims, a);
    const cite = cites.find((c) => c.start === a);
    if (cite) atoms.push({ kind: "cite", id: cite.id, claim });
    else {
      const piece = text.slice(a, b).replace(/\*\*/g, "");
      if (piece) atoms.push({ kind: "text", text: piece, claim });
    }
  }
  return atoms;
}

/** Paragraphs and simple lists, with offsets preserved so claim spans still line up. */
export function renderBlocks(text: string, rawClaims: Claim[]): Block[] {
  const claims = validClaims(text, rawClaims);
  const blocks: Block[] = [];
  let para: { start: number; end: number } | null = null;
  const flushPara = () => {
    if (para) blocks.push({ kind: "p", items: [inlineAtoms(text, para.start, para.end, claims)] });
    para = null;
  };
  let offset = 0;
  let code: { lang: string; start: number; end: number } | null = null;
  for (const line of text.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    offset = lineEnd + 1;
    const fence = /^\s*```\s*([\w+-]*)/.exec(line);
    if (code) {
      if (fence && !fence[1]) {
        // Closing fence.
        blocks.push({ kind: "code", lang: code.lang, code: text.slice(code.start, Math.max(code.start, lineStart - 1)), start: code.start, end: Math.max(code.start, lineStart - 1) });
        code = null;
      }
      continue;
    }
    if (fence) {
      flushPara();
      code = { lang: fence[1]!.toLowerCase(), start: lineEnd + 1, end: lineEnd + 1 };
      continue;
    }
    if (!line.trim()) {
      flushPara();
      continue;
    }
    const m = LIST_ITEM.exec(line);
    if (m) {
      flushPara();
      const kind = /\d/.test(m[2]!) ? "ol" : "ul";
      const last = blocks.at(-1);
      const item = inlineAtoms(text, lineStart + m[0].length, lineEnd, claims);
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
      continue;
    }
    if (para) para.end = lineEnd;
    else para = { start: lineStart, end: lineEnd };
  }
  flushPara();
  // A block still streaming in (no closing fence yet) renders as code so far.
  if (code) blocks.push({ kind: "code", lang: code.lang, code: text.slice(Math.min(code.start, text.length)), start: code.start, end: text.length });
  return blocks;
}
