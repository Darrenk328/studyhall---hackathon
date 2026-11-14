/**
 * Review screenshots of the chat page (live answers, so it costs 4 questions).
 *   node scripts/screenshots.mjs            # expects the web app at http://localhost:3123
 *   BASE_URL=http://localhost:3000 node scripts/screenshots.mjs
 * For each of 375px and 1280px, light and dark: mid-answer, finished, and the open receipts drawer.
 * Writes PNGs to docs/screenshots/.
 */
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const OUT = "docs/screenshots";
const QUESTION = "Who should get a flu shot this season, according to the CDC?";
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1280", width: 1280, height: 860 },
];
const THEMES = ["light", "dark"];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const written = [];
const axeFindings = [];

/** Automated accessibility check (WCAG 2.x A/AA rules) on the current page state. */
async function axe(page, label) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of res.violations) axeFindings.push(`${label}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
  console.log(`  axe ${label}: ${res.violations.length} violations`);
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const shot = async (label, opts = {}) => {
      const path = `${OUT}/chat-${vp.name}-${theme}-${label}.png`;
      await page.screenshot({ path, ...opts });
      written.push(path);
      console.log(`  ${path}`);
    };
    console.log(`${vp.name}px ${theme}`);
    await page.goto(`${BASE}/#health`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.locator(".starter").first().waitFor();
    if (vp.name === "1280") await axe(page, `${vp.name}-${theme}-empty`);
    await page.locator("#composer").fill(QUESTION);
    await page.keyboard.press("Enter");

    // Mid-answer: the answer is streaming, verification hasn't finished.
    await page.waitForFunction(() => (document.querySelector(".answer")?.textContent?.length ?? 0) > 180, null, { timeout: 60_000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await shot("mid-answer");

    // Finished: the confidence badge is in the footer.
    await page.locator(".answer-footer .badge").waitFor({ timeout: 120_000 });
    await page.waitForTimeout(500); // let the fade-in settle
    // Viewport capture scrolled to the end of the answer (full-page captures misplace sticky elements).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    await shot("finished");
    await axe(page, `${vp.name}-${theme}-finished`);

    // Receipts drawer, opened from the first citation chip.
    await page.locator(".answer .cite").first().click();
    await page.locator("[role=dialog]").waitFor();
    await page.waitForTimeout(300);
    await shot("receipts");
    await axe(page, `${vp.name}-${theme}-receipts`);
    await context.close();
  }
}

await browser.close();
console.log(`\n${written.length} screenshots in ${OUT}/`);
console.log(axeFindings.length ? `\naxe findings:\n${axeFindings.join("\n")}` : "\naxe: no WCAG A/AA violations found");
