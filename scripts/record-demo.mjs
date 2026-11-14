#!/usr/bin/env node
/**
 * Record the demo answers for `/?demo=1` by asking a running Studyhall server, live, and saving every
 * streamed event with its timing to apps/web/public/demo/recordings.json.
 *   node scripts/record-demo.mjs [--base http://localhost:3000]
 * Questions come from docs/demo-questions.md (picked by the eval) plus the MATLAB compare.
 */
/* global fetch, performance, TextDecoder */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const base = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "http://localhost:3000";

export const DEMO_QUESTIONS = [
  { question: "How much does a UK Electronic Travel Authorisation (ETA) cost to apply for?", category: "travel", compare: true },
  { question: "As of November 2026, what is the newest stable feature (minor) release of Python?", category: "tech", compare: true },
  { question: "As of November 2026, which crewed mission holds the record for the farthest distance humans have traveled from Earth?", category: "science", compare: true },
  { question: "Which function replaces matlab.addons.install?", category: "engineering", app: "matlab", compare: true },
];

async function record(item) {
  const t0 = performance.now();
  const recordedAt = new Date().toISOString();
  const res = await fetch(`${base}/api/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: item.question, category: item.category, history: [], ...(item.app ? { app: item.app } : {}), ...(item.compare ? { compare: true } : {}) }),
  });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text()}`);
  const events = [];
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (data) events.push({ t: Math.round(performance.now() - t0), ev: JSON.parse(data) });
    }
  }
  const done = events.find((e) => e.ev.type === "done");
  if (!done) throw new Error(`no done event for "${item.question}" (last: ${events.at(-1)?.ev.type})`);
  const r = done.ev.receipts;
  console.log(`${item.category}: ${(events.at(-1).t / 1000).toFixed(1)}s, ${events.length} events, confidence ${r.confidence}\n  ${r.answer.split("\n")[0].slice(0, 160)}`);
  return { ...item, recordedAt, events };
}

// --only <category> re-records one question and keeps the others from the existing file.
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : undefined;
const file = join(root, "apps", "web", "public", "demo", "recordings.json");
const existing = only && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).items : [];
const items = [];
for (const q of DEMO_QUESTIONS) {
  const keep = only && q.category !== only ? existing.find((e) => e.question === q.question) : undefined;
  items.push(keep ?? (await record(q)));
}
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ recordedAt: items[0].recordedAt, items }) + "\n");
console.log(`wrote ${file}`);
