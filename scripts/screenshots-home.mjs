/**
 * Home page and rail screenshots (no questions spent).
 *   node scripts/screenshots-home.mjs     # expects the web app at http://localhost:3123
 * Writes docs/screenshots/home-*.png, runs axe on each state, and fails on sideways scroll.
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
// The design is dark only, so one theme.
const THEMES = ["dark"];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const findings = [];
const overflow = [];

async function check(page, label, width) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of res.violations) findings.push(`${label}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > width) overflow.push(`${label}: scrollWidth ${sw} > ${width}`);
}

for (const run of RUNS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({ viewport: { width: run.width, height: run.height }, colorScheme: theme, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const label = `${run.name}-${theme}`;
    const shot = async (what, opts = {}) => {
      const path = `${OUT}/home-${label}-${what}.png`;
      await page.screenshot({ path, ...opts });
      console.log(`  ${path}`);
    };
    await page.goto(`${BASE}/`);
    await page.locator(".home-hero").waitFor();
    await page.waitForTimeout(400);
    await shot("home", { fullPage: true });
    await check(page, `${label} home`, run.width);
    // Top bar with "More topics" open.
    await page.locator(".more-toggle").click();
    await page.waitForTimeout(200);
    if (run.width >= 768) await shot("rail-more");
    await check(page, `${label} rail-more`, run.width);
    // A flagship with its safety note.
    await page.goto(`${BASE}/#legal`);
    await page.locator(".safety-note").waitFor();
    await shot("legal");
    await check(page, `${label} legal`, run.width);
    await context.close();
  }
}

await browser.close();
console.log(findings.length ? `\naxe findings:\n${findings.join("\n")}` : "\naxe: no WCAG 2.1 A/AA violations");
console.log(overflow.length ? `sideways scroll:\n${overflow.join("\n")}` : "no sideways scroll");
if (overflow.length) process.exitCode = 1;
