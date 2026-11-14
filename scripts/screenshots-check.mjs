/**
 * "Check a claim" screenshots from the demo replay (no questions spent).
 *   node scripts/screenshots-check.mjs     # expects the web app at http://localhost:3123
 * Writes docs/screenshots/check-*.png, runs axe on each state, and fails on sideways scroll.
 */
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const OUT = "docs/screenshots";
const RUNS = [
  { name: "375", width: 375, height: 812, theme: "light" },
  { name: "1280", width: 1280, height: 1000, theme: "light" },
  { name: "1280", width: 1280, height: 1000, theme: "dark" },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const findings = [];
const overflow = [];

async function axe(page, label) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of res.violations) findings.push(`${label}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
}

for (const run of RUNS) {
  const context = await browser.newContext({ viewport: { width: run.width, height: run.height }, colorScheme: run.theme, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const label = `${run.name}-${run.theme}`;
  const shot = async (what, opts = {}) => {
    const path = `${OUT}/check-${label}-${what}.png`;
    await page.screenshot({ path, ...opts });
    console.log(`  ${path}`);
  };
  const widthOk = async (what) => {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > run.width) overflow.push(`${label} ${what}: scrollWidth ${sw} > ${run.width}`);
  };
  const scrollTo = async (selector) => {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const header = document.querySelector(".rail");
      const offset = window.innerWidth < 768 && header ? header.getBoundingClientRect().height + 12 : 24;
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
    }, selector);
    await page.waitForTimeout(400);
  };
  console.log(`${run.name}px ${run.theme}`);

  await page.goto(`${BASE}/?demo=1&speed=4#check`);
  await page.locator(".demo-questions button").first().waitFor();
  if (run.theme === "light") {
    await shot("empty");
    await axe(page, `${label} empty`);
  }
  await page.locator(".demo-questions button", { hasText: "Check an AI" }).click();
  // Mid-check: claims listed, verdicts arriving.
  await page.locator(".claim-card").first().waitFor();
  await page.waitForTimeout(1500);
  await scrollTo(".check-run");
  await shot("streaming");
  await page.locator(".check-summary").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await scrollTo(".claim-cards");
  await shot("verdicts");
  await widthOk("verdicts");
  await axe(page, `${label} verdicts`);
  await scrollTo(".corrected");
  await shot("corrected");
  await page.locator(".check-run .answer-footer button", { hasText: "Receipts" }).click();
  await page.locator(".drawer").waitFor();
  await page.waitForTimeout(300);
  await shot("receipts");
  await widthOk("receipts");
  await axe(page, `${label} receipts`);
  await context.close();
}

await browser.close();
console.log(findings.length ? `\naxe findings:\n${findings.join("\n")}` : "\naxe: no WCAG 2.1 A/AA violations");
console.log(overflow.length ? `sideways scroll:\n${overflow.join("\n")}` : "no sideways scroll");
if (overflow.length) process.exitCode = 1;
