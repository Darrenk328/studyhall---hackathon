/** Keyboard-only check: focus order, visible focus rings, skip link, category switching. No questions asked. */
import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
await p.goto((process.env.BASE_URL ?? "http://localhost:3123") + "/#health"); await p.locator(".starter").first().waitFor();
const seen = [];
for (let i = 0; i < 20; i++) {
  await p.keyboard.press("Tab");
  seen.push(await p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} "${(e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().slice(0, 40)}" outline=${cs.outlineStyle}/${cs.outlineWidth}`; }));
}
console.log(seen.join("\n"));
// Skip link jumps to the composer; hash nav via keyboard switches category.
const p2 = await b.newPage({ viewport: { width: 1280, height: 860 } });
await p2.goto((process.env.BASE_URL ?? "http://localhost:3123") + "/#health"); await p2.locator(".starter").first().waitFor();
await p2.keyboard.press("Tab"); await p2.keyboard.press("Enter");
console.log("after skip link (focused id, hash):", await p2.evaluate(() => [document.activeElement?.id, location.hash]));
await p.locator('a.cat[href="#finance"]').focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
console.log("after Enter on Finance:", await p.evaluate(() => [location.hash, document.querySelector(".cat-header h1")?.textContent]));
await b.close();

// Receipts drawer by keyboard: open from a citation chip, Tab stays inside, Escape closes and returns focus.
{
  const { seededTurn, seedPage } = await import("./seed-turn.mjs");
  const b2 = await chromium.launch();
  const ctx = await b2.newContext({ viewport: { width: 1280, height: 860 } });
  const p3 = await ctx.newPage();
  await seedPage(p3, process.env.BASE_URL ?? "http://localhost:3123", seededTurn());
  await p3.locator(".answer .cite").first().focus();
  const chipLabel = await p3.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await p3.keyboard.press("Enter");
  await p3.locator("[role=dialog]").waitFor();
  let escaped = false;
  for (let i = 0; i < 40; i++) {
    await p3.keyboard.press("Tab");
    if (!(await p3.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement)))) escaped = true;
  }
  await p3.keyboard.press("Escape");
  const after = await p3.evaluate(() => [Boolean(document.querySelector("[role=dialog]")), document.activeElement?.getAttribute("aria-label")]);
  console.log(`drawer: opened from "${chipLabel}"; focus left the drawer during 40 Tabs: ${escaped}; after Escape open=${after[0]}, focus back on "${after[1]}"`);
  await b2.close();
}
