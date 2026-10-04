// Browser regression for /scholarships filters (Repair Session 2). NOT part of `npm run test:search` (needs a running app,
// seeded published scholarships and Playwright). Usage: BASE_URL=http://localhost:3000 [PLAYWRIGHT_CORE=path] [CHROMIUM=path] node tests/search/ui-regression.cjs
// Expects >= 13 published scholarships incl. >= 1 in country slug `germany` and none matching country `germany` + funding `not_funded`.
const assert = require("node:assert/strict");
let chromium; try { ({ chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core")); } catch { console.log("SKIP: playwright-core not installed"); process.exit(0); }
const BASE = process.env.BASE_URL || "http://localhost:3000";
const RE = /(\d+) scholarships? found|No scholarships match these filters|No scholarships are available yet|temporarily unavailable/;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-sandbox"] });
  const p = await b.newPage(); let fail = 0;
  const state = async () => { const t = await p.locator("body").innerText(); const m = t.match(RE); return m ? m[0] : "?"; };
  const form = () => p.evaluate(() => Object.fromEntries([...new FormData(document.querySelector("form[role=search]"))]));
  const settle = () => p.waitForTimeout(1200);
  const t = async (name, fn) => { try { await fn(); console.log("  PASS", name); } catch (e) { fail++; console.log("  FAIL", name, "-", e.message.split("\n")[0]); } };
  const count = async () => Number((await state()).match(/^(\d+)/)?.[1] ?? -1);
  await p.goto(`${BASE}/scholarships`);
  let all; await t("no filters lists scholarships", async () => { all = await count(); assert.ok(all > 0); });
  await t("one filter (country) narrows", async () => { await p.selectOption("#country", "germany"); await settle(); const n = await count(); assert.ok(n > 0 && n < all); });
  await t("two filters intersect", async () => { await p.selectOption("#funding", "not_funded"); await settle(); assert.match(await state(), /No scholarships match these filters/); });
  await t("Reset restores all AND clears stale form values", async () => { await p.click("text=Reset filters"); await settle(); assert.equal(await count(), all); const f = await form(); assert.equal(f.country, ""); assert.equal(f.funding, ""); });
  await t("filter after Reset is not polluted by earlier selections", async () => { await p.selectOption("#funding", "fully_funded"); await settle(); assert.ok(p.url().includes("country=&") || !p.url().includes("country=germany")); assert.ok((await count()) > 0); });
  await t("removing a chip clears that select", async () => { await p.goto(`${BASE}/scholarships?country=germany&funding=fully_funded`); await p.click("[aria-label='Remove filter: Germany']"); await settle(); assert.equal((await form()).country, ""); assert.equal((await form()).funding, "fully_funded"); });
  await t("back/forward re-syncs the form with the URL", async () => { await p.goto(`${BASE}/scholarships?country=germany`); await p.click("text=Reset filters"); await settle(); await p.goBack(); await settle(); assert.equal((await form()).country, "germany"); });
  await t("pagination keeps filters", async () => { await p.goto(`${BASE}/scholarships?funding=fully_funded&sort=name`); if (await p.locator("a[rel=next]").count()) { await p.click("a[rel=next]"); await settle(); assert.ok(p.url().includes("funding=fully_funded") && p.url().includes("page=2")); } else console.log("    (single page; pagination not exercised)"); });
  await t("refresh keeps the active filter state", async () => { await p.goto(`${BASE}/scholarships?country=germany&sort=name`); await p.reload(); assert.equal((await form()).country, "germany"); assert.equal((await form()).sort, "name"); });
  await b.close(); console.log(fail ? `\n${fail} FAILED` : "\nall passed"); process.exit(fail ? 1 : 0);
})();
