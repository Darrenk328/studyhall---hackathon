import { z } from "zod";
import { formatSources, UNTRUSTED_SOURCES_RULE } from "./answer.js";
import { isoDate } from "./text.js";
import type { LlmProvider, NoteItem, ReadSource, StudyNotes } from "./types.js";

const Item = z.object({ text: z.string(), sourceIds: z.array(z.number()) });
export const NotesSchema = z.object({
  focus: z.string(),
  keyPoints: z.array(Item),
  conflicts: z.array(Item),
  mayBeStale: z.array(Item),
});

/** Drop unknown source ids and empty items; items left with no valid source are dropped too. */
export function cleanNotes(raw: z.infer<typeof NotesSchema>, validIds: ReadonlySet<number>): StudyNotes {
  const clean = (items: NoteItem[], max: number): NoteItem[] =>
    items
      .map((i) => ({ text: i.text.trim(), sourceIds: [...new Set(i.sourceIds.filter((n) => validIds.has(n)))].sort((a, b) => a - b) }))
      .filter((i) => i.text && i.sourceIds.length)
      .slice(0, max);
  return {
    focus: raw.focus.trim(),
    keyPoints: clean(raw.keyPoints, 6),
    conflicts: clean(raw.conflicts, 4),
    mayBeStale: clean(raw.mayBeStale, 4),
  };
}

/**
 * PLAN §4 step 4: Haiku takes study notes from the sources that were read. Runs in parallel with
 * the answer step, so it adds no wall-clock time. The notes are for the reader; the answer step
 * doesn't use them.
 */
export async function takeNotes(
  claude: LlmProvider,
  question: string,
  sources: ReadSource[],
  now: Date,
  opts: { versionAware?: boolean; software?: string } = {},
): Promise<{ notes: StudyNotes; model: string }> {
  const res = await claude.json({
    role: "notes",
    system: `You take short, accurate study notes from sources before an answer is written. Use only the sources. Source ids are the id attributes of the <source> tags. ${UNTRUSTED_SOURCES_RULE}`,
    prompt: [
      `Today is ${isoDate(now)}.`,
      `Sources:\n\n${formatSources(sources)}`,
      "===",
      `Question: ${question}`,
      "",
      "Return:",
      "- focus: one sentence on what the question is really asking.",
      "- keyPoints: 3 to 6 facts from the sources that matter for the question, each with the ids of the sources that state it.",
      "- conflicts: places where sources disagree, naming what each says, with their ids. Empty if none.",
      "- mayBeStale: facts or sources that may be out of date (old dates, superseded versions, a newer source saying otherwise), with ids. Empty if none.",
      ...(opts.software ? [`Software: ${opts.software}`] : []),
      ...(opts.versionAware
        ? ["Put any build- or release-specific instructions (menu paths, version numbers, which functions exist) under mayBeStale, since they change between releases."]
        : []),
      "Keep each item to one short sentence.",
    ].join("\n"),
    schema: NotesSchema,
  });
  return { notes: cleanNotes(res.data, new Set(sources.map((s) => s.id))), model: res.model };
}
