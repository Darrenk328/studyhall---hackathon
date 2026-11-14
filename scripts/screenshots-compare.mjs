/**
 * Compare-mode and About screenshots (3 live compare questions).
 *   node scripts/screenshots-compare.mjs     # expects the web app at http://localhost:3123
 * Writes docs/screenshots/compare-*.png and about-*.png, and runs axe on each state.
 */
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const OUT = "docs/screenshots";
const QUESTION = "Which function replaces matlab.addons.install?";
const RUNS = [
  { name: "375", width: 375, height: 812, theme: "light" },
  { name: "1280", width: 1280, height: 1000, theme: "light" },
  { name: "1280", width: 1280, height: 1000, theme: "dark" },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const findings = [];
const written = [];

async function axe(page, label) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of res.violations) findings.push(`${label}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
}

for (const run of RUNS) {
  const context = await browser.newContext({ viewport: { width: run.width, height: run.height }, colorScheme: run.theme, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const shot = async (label) => {
    const path = `${OUT}/compare-${run.name}-${run.theme}-${label}.png`;
    await page.screenshot({ path });
    written.push(path);
    console.log(`  ${path}`);
  };
  const scrollTo = async (selector) => {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      // Clear the sticky header (taller on mobile, where it holds the category chips).
      const header = document.querySelector(".rail");
      const offset = window.innerWidth < 768 && header ? header.getBoundingClientRect().height + 16 : 70;
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
    }, selector);
    await page.waitForTimeout(200);
  };
  console.log(`${run.name}px ${run.theme}`);

  // About page (no questions spent).
  await page.goto(`${BASE}/about`);
  await page.locator(".pipeline").waitFor();
  if (run.theme === "light") {
    const path = `${OUT}/about-${run.name}-light.png`;
    await page.screenshot({ path, fullPage: true });
    written.push(path);
    console.log(`  ${path}`);
    await axe(page, `about-${run.name}`);
  }

  await page.goto(`${BASE}/#engineering`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.locator(".starter").first().waitFor();
  await page.getByRole("button", { name: "MATLAB", exact: true }).click();
  await page.getByRole("switch", { name: "Compare with no search" }).click();
  await page.locator("#composer").fill(QUESTION);
  await page.keyboard.press("Enter");
  await page.locator(".differ-list, .differ-agree, .differ .r-meta").first().waitFor({ timeout: 150_000 });
  await page.waitForTimeout(500);

  if (run.width >= 1024) {
    await scrollTo(".user-bubble");
    await shot("side-by-side");
    await axe(page, `compare-${run.name}-${run.theme}`);
    await scrollTo(".differ");
    await shot("differ");
  } else {
    await scrollTo(".user-bubble");
    await shot("tab-studyhall");
    await page.getByRole("tab", { name: "From memory" }).click();
    await scrollTo(".tablist");
    await shot("tab-memory");
    await axe(page, `compare-${run.name}-${run.theme}-memory-tab`);
    await scrollTo(".differ");
    await shot("differ");
  }
  await context.close();
}

await browser.close();
console.log(`\n${written.length} screenshots`);
console.log(findings.length ? `axe findings:\n${findings.join("\n")}` : "axe: no WCAG A/AA violations found");
