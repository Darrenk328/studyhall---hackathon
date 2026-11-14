/**
 * A/B timing for the verify step: same inputs (the recorded planted-error fixtures), verify thinking
 * "adaptive" vs "off", interleaved to reduce drift. Also checks each planted sentence is still caught.
 *   pnpm --filter core verify-bench [--rounds 3]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeClient, loadEnv } from "../src/index.js";
import { squash } from "../src/pipeline/text.js";
import type { Claim, ReadSource } from "../src/pipeline/types.js";
import { verifyAnswer } from "../src/pipeline/verify.js";

const here = dirname(fileURLToPath(import.meta.url));
const roundsIdx = process.argv.indexOf("--rounds");
const rounds = roundsIdx >= 0 ? Number(process.argv[roundsIdx + 1]) : 3;
const MODES = ["adaptive", "off"] as const;

interface Fixture {
  kind: string;
  sources: Omit<ReadSource, "score" | "foundBy" | "preferred" | "authority" | "cited">[];
  answer: string;
  originalSentence: string;
  plantedSentence: string;
  plantedAnswer: string;
}

const fixtures: Fixture[] = ["number", "negation", "entity"].map((k) =>
  JSON.parse(readFileSync(join(here, "..", "test", "fixtures", `verify-planted-${k}.json`), "utf8")),
);

function plantedVerdict(claims: Claim[], f: Fixture): string {
  const a = squash(f.originalSentence).split(" ");
  const changed = squash(f.plantedSentence).split(" ").filter((w) => !a.includes(w));
  const p = squash(f.plantedSentence);
  const c = claims.find((x) => squash(x.text) === p) ?? claims.find((x) => p.includes(squash(x.text)) && changed.some((w) => squash(x.text).split(" ").includes(w)));
  return c?.verdict ?? "NOT FOUND";
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main() {
  loadEnv();
  const clients = Object.fromEntries(MODES.map((m) => [m, new ClaudeClient({ settings: { verify: { thinking: m } } })]));
  const times: Record<string, number[]> = { adaptive: [], off: [] };
  const caught: Record<string, { ok: number; n: number }> = { adaptive: { ok: 0, n: 0 }, off: { ok: 0, n: 0 } };
  const falseFlags: Record<string, number> = { adaptive: 0, off: 0 };

  for (let r = 0; r < rounds; r++) {
    for (const f of fixtures) {
      const sources = f.sources.map((s) => ({ ...s, score: 0, foundBy: [], preferred: true, authority: true, cited: true })) as ReadSource[];
      for (const mode of r % 2 ? [...MODES].reverse() : MODES) {
        for (const [label, text] of [["planted", f.plantedAnswer], ["original", f.answer]] as const) {
          const t = performance.now();
          const { claims } = await verifyAnswer(clients[mode]!, text, sources);
          const ms = Math.round(performance.now() - t);
          times[mode]!.push(ms);
          if (label === "planted") {
            const v = plantedVerdict(claims, f);
            caught[mode]!.n++;
            if (v === "unsupported") caught[mode]!.ok++;
            console.log(`round ${r + 1} ${f.kind.padEnd(8)} ${mode.padEnd(8)} planted  ${String(ms).padStart(5)}ms  ${v}`);
          } else {
            const flagged = claims.filter((c) => c.verdict === "unsupported").length;
            falseFlags[mode]! += flagged;
            console.log(`round ${r + 1} ${f.kind.padEnd(8)} ${mode.padEnd(8)} original ${String(ms).padStart(5)}ms  ${flagged} unsupported`);
          }
        }
      }
    }
  }
  console.log("\nmode      median ms  mean ms  planted caught  unsupported on originals");
  for (const m of MODES) {
    const xs = times[m]!;
    console.log(
      `${m.padEnd(9)} ${String(median(xs)).padStart(9)}  ${String(Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)).padStart(7)}  ` +
        `${caught[m]!.ok}/${caught[m]!.n}`.padStart(14) + `  ${falseFlags[m]}`.padStart(26),
    );
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
