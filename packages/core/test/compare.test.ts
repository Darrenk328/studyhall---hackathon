import { describe, expect, it, vi } from "vitest";
import { getCategory } from "../src/categories/registry.js";
import type { CallInput } from "../src/providers/claude.js";
import { memoryAnswer, memorySystemPrompt, verifiedClaims, whereTheyDiffer } from "../src/pipeline/compare.js";
import type { Claim, LlmProvider, Receipts } from "../src/pipeline/types.js";

const NOW = new Date("2026-11-13T12:00:00Z");
const eng = getCategory("engineering")!;
const claim = (text: string, verdict: Claim["verdict"], sourceIds: number[], kind?: "code"): Claim => ({ text, verdict, sourceIds, note: "", evidence: "", span: null, ...(kind ? { kind } : {}) });
const receipts = {
  sources: [1, 2, 3].map((id) => ({ id })),
  claims: [
    claim("In R2026b, mpminstall replaces matlab.addons.install [1].", "supported", [1]),
    claim("matlab.addons.install is not recommended [2].", "partial", [2]),
    claim("These sources are recent.", "meta", []),
    claim("mpminstall", "supported", [1], "code"),
    claim("Made-up thing [3].", "unsupported", [3]),
  ],
} as unknown as Receipts;

function fakeJson(data: unknown) {
  const calls: CallInput[] = [];
  const claude = { json: vi.fn(async (i: CallInput) => (calls.push(i), { data, model: "claude-haiku-5-5", usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false })) } as unknown as LlmProvider;
  return { claude, calls };
}

describe("from-memory answer", () => {
  it("uses the category persona, today's date and no sources, on the answer model", async () => {
    const sys = memorySystemPrompt(eng, NOW);
    expect(sys).toContain(eng.persona);
    expect(sys).toContain("2026-11-13");
    expect(sys).toMatch(/no sources/);
    const stream = vi.fn(async function* (_input: CallInput) {
      yield "x";
      return { text: "x", model: "m", truncated: false, usage: { inputTokens: 0, outputTokens: 0 }, failedOver: false };
    });
    const gen = memoryAnswer({ stream } as unknown as LlmProvider, "Which function replaces matlab.addons.install?", eng, NOW);
    await gen.next();
    expect(stream.mock.calls[0]![0]).toMatchObject({ role: "answer", prompt: "Which function replaces matlab.addons.install?" });
  });
});

describe("where they differ", () => {
  it("compares against verified prose claims only (no meta, code or unsupported)", async () => {
    expect(verifiedClaims(receipts).map((c) => c.text)).toEqual([
      "In R2026b, mpminstall replaces matlab.addons.install [1].",
      "matlab.addons.install is not recommended [2].",
    ]);
    const { claude, calls } = fakeJson({ agree: true, differences: [] });
    await whereTheyDiffer(claude, "q", "memory text", receipts);
    expect(calls[0]!.role).toBe("compare");
    expect(calls[0]!.prompt).toContain("[sources: 1]");
    expect(calls[0]!.prompt).not.toContain("Made-up thing");
  });

  it("keeps at most 3 differences, drops unknown source ids and differences left without one", async () => {
    const d = (n: number, ids: number[]) => ({ memory: `m${n}`, sources: `s${n}`, sourceIds: ids });
    const { claude } = fakeJson({ agree: false, differences: [d(1, [1, 9]), d(2, [9]), d(3, [2]), d(4, [3]), d(5, [1])] });
    const r = await whereTheyDiffer(claude, "q", "memory", receipts);
    expect(r).toEqual({
      agree: false,
      model: "claude-haiku-5-5",
      differences: [
        { memory: "m1", sources: "s1", sourceIds: [1] },
        { memory: "m3", sources: "s3", sourceIds: [2] },
        { memory: "m4", sources: "s4", sourceIds: [3] },
      ],
    });
  });

  it("agreement means no differences", async () => {
    const { claude } = fakeJson({ agree: true, differences: [] });
    expect(await whereTheyDiffer(claude, "q", "memory", receipts)).toMatchObject({ agree: true, differences: [] });
  });
});
