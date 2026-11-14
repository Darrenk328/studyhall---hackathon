/**
 * "Check my code" screenshots from the demo replay (no questions spent).
 *   node scripts/screenshots-code.mjs     # expects the web app at http://localhost:3123
 * Writes docs/screenshots/code-*.png, runs axe on each state, and fails on sideways scroll.
 */
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const OUT = "docs/screenshots";
const RUNS = [
  { name: "375", width: 375, height: 812 },
  { name: "1280", width: 1280, height: 1000 },
];
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const findings = [];
const overflow = [];
for (const run of RUNS) {
  const context = await browser.newContext({ viewport: { width: run.width, height: run.height }, colorScheme: "dark", deviceScaleFactor: 2 });
  const page = await context.newPage();
  const shot = async (what) => {
    const path = `${OUT}/code-${run.name}-${what}.png`;
    await page.screenshot({ path });
    console.log(`  ${path}`);
  };
  const check = async (what) => {
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of res.violations) findings.push(`${run.name} ${what}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > run.width) overflow.push(`${run.name} ${what}: scrollWidth ${sw}`);
  };
  console.log(`${run.name}px`);
  // Empty state, then paste code so the call list shows before any check.
  await page.goto(`${BASE}/#code`);
  await page.locator(".mode-switch").waitFor();
  await page.locator("#code-input").fill('% Install a toolbox from a file\nmatlab.addons.install("SignalTools.mltbx");\nT = readtable("data.csv");');
  await page.locator(".calls-preview").waitFor();
  await shot("calls-listed");
  await check("calls-listed");
  // The recorded check, replayed.
  await page.goto(`${BASE}/?demo=1&speed=4#code`);
  await page.locator(".demo-questions button", { hasText: "Check my code" }).click();
  await page.locator(".code-diff").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const el = document.querySelector(".check-run");
    const header = document.querySelector(".rail");
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (header ? header.getBoundingClientRect().height + 12 : 24));
  });
  await page.waitForTimeout(300);
  await shot("verdict");
  await check("verdict");
  await page.locator(".code-diff").scrollIntoViewIfNeeded();
  await shot("diff");
  await page.locator(".check-run .answer-footer button", { hasText: "Receipts" }).click();
  await page.locator(".drawer").waitFor();
  await page.waitForTimeout(300);
  await shot("receipts");
  await check("receipts");
  await context.close();
}
await browser.close();
console.log(findings.length ? `\naxe findings:\n${findings.join("\n")}` : "\naxe: no WCAG 2.1 A/AA violations");
console.log(overflow.length ? `sideways scroll:\n${overflow.join("\n")}` : "no sideways scroll");
if (overflow.length) process.exitCode = 1;
