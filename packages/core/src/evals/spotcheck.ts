/** Read the human verdicts from evals/spotcheck.md and compare them with the judge's. */
import type { Verdict } from "./grade.js";

export interface SpotcheckAgreement {
  total: number;
  graded: number;
  agree: number;
  /** agree / graded */
  agreement: number;
  disagreements: { id: string; system: string; judge: Verdict; human: Verdict }[];
  /** Human lines that were filled in but couldn't be read as a verdict. */
  unreadable: { id: string; system: string; text: string }[];
}

/** "Correct ✓", "partially correct", "WRONG (outdated)", "refused" → a verdict; blank → null. */
export function parseVerdict(text: string): Verdict | null | "unreadable" {
  const t = text.replace(/[_*`]/g, " ").trim().toLowerCase();
  if (!t) return null;
  if (/\bpartial|partly|half/.test(t)) return "partial";
  if (/\b(declin|refus|no answer|abstain)/.test(t)) return "declined";
  if (/\b(wrong|incorrect|outdated)\b/.test(t)) return "wrong";
  if (/\bcorrect|right\b|✓|✅/.test(t)) return "correct";
  return "unreadable";
}

export function spotcheckAgreement(md: string): SpotcheckAgreement {
  const sections = md.split(/^## /m).slice(1);
  const out: SpotcheckAgreement = { total: 0, graded: 0, agree: 0, agreement: 0, disagreements: [], unreadable: [] };
  for (const s of sections) {
    const head = /^\d+\.\s+(\S+)\s+\(system\s+([ABC])/.exec(s);
    const judge = /\*\*Judge verdict:\*\*\s*(correct|partial|wrong|declined)/i.exec(s);
    if (!head || !judge) continue;
    out.total++;
    const humanLine = /\*\*Human verdict:\*\*([^\n]*)/.exec(s)?.[1] ?? "";
    const human = parseVerdict(humanLine);
    if (human === null) continue;
    if (human === "unreadable") {
      out.unreadable.push({ id: head[1]!, system: head[2]!, text: humanLine.trim() });
      continue;
    }
    out.graded++;
    const j = judge[1]!.toLowerCase() as Verdict;
    if (j === human) out.agree++;
    else out.disagreements.push({ id: head[1]!, system: head[2]!, judge: j, human });
  }
  out.agreement = out.graded ? out.agree / out.graded : 0;
  return out;
}
