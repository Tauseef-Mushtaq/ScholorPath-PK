import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = "http://localhost:3200", MOCK = "http://127.0.0.1:54321", SHOTS = process.env.SHOTS || "/tmp";
const mock = async (p, body) => (await fetch(MOCK + p, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })).json();
let pass = 0, fail = 0;
const check = async (name, cond, extra = "") => { if (await cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name, extra); } };
const sees = (page, text, ms = 4000) => page.getByText(text, { exact: false }).first().waitFor({ timeout: ms }).then(() => true, () => false);

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const S = (id, name, o = {}) => ({ id, name, provider: "Provider " + name, status: "active", degree_level: "Master's", field: "Computer Science", funding_type: "fully_funded", deadline: "2027-03-01", ...o });
const SEED = [
  S(U(1), "Alpha CS Masters", { minimum_gpa: 3.0, minimum_gpa_scale: 4, english_requirement_summary: "IELTS 6.5" }),
  S(U(2), "Beta Medicine Masters", { field: "Medicine" }),
  S(U(3), "Secret Draft Scholarship", { status: "draft" }),
  S(U(4), "Secret Archived Scholarship", { status: "archived" }),
  S(U(5), "Gamma Closed Scholarship", { deadline: "2026-09-01" }),
  S(U(6), "Delta No Deadline Scholarship", { deadline: null }),
  S(U(7), "Epsilon Strict GPA Scholarship", { minimum_gpa: 3.9, minimum_gpa_scale: 4 }),
  S(U(8), "Zeta Needs Confirmation", { requirements: [{ title: "Two recommendation letters", required: true }] }),
];
const edu = (o) => ({ level: "bachelor", field: "Computer Science", cgpa: 3.6, cgpa_scale: 4, start_date: "2020-09-01", expected_graduation: "2024-06-30", ...o });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
async function signup(email, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(BASE + "/signup");
  await page.fill("#email", email); await page.fill("#password", "Correct-horse-1"); await page.fill("#confirmPassword", "Correct-horse-1");
  await page.click("button[type=submit]"); await page.waitForURL("**/dashboard");
  return { ctx, page };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

try {
  await mock("/_mock/set-scholarships", SEED);

  for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    console.log(`Matches page — ${label} (${viewport.width}px)`);
    const email = `ui-${label}@example.com`;
    const { ctx, page } = await signup(email, viewport);
    await mock("/_mock/set-education", { email, education: [edu({})] });

    await page.goto(BASE + "/matches");
    await check("student can open /matches (heading visible)", page.getByRole("heading", { level: 1, name: "My scholarship matches" }).waitFor({ timeout: 5000 }).then(() => true, () => false));
    await check("exactly one h1", page.locator("h1").count().then((n) => n === 1));
    await check("relevant scholarship + status badge visible", sees(page, "Alpha CS Masters") && (await page.locator('[data-decision="eligible"]').count()) > 0);
    await check("reasons are explained (Why it matched, CGPA numbers)", sees(page, "Why it matched") && sees(page, "3.6/4"));
    await check("not-checked info (language test) shown separately", sees(page, "IELTS 6.5") && sees(page, "For your information (not checked)"));
    await check("draft and archived are not on the page", page.getByText("Secret Draft").count().then((n) => n === 0) && page.getByText("Secret Archived").count().then((n) => n === 0));
    await check("closed + other-field scholarships hidden by default", page.getByText("Gamma Closed").count().then((n) => n === 0) && page.getByText("Beta Medicine").count().then((n) => n === 0));
    await check("no horizontal scrolling", overflow(page).then((o) => !o));
    const cols = await page.evaluate(() => { const li = [...document.querySelectorAll("main li, ul > li")].filter((e) => e.textContent.includes("Why it matched") || e.textContent.includes("Needs your confirmation")); return new Set(li.map((e) => Math.round(e.getBoundingClientRect().left))).size; });
    await check(label === "mobile" ? "single column on mobile" : "two columns on desktop", label === "mobile" ? cols === 1 : cols === 2, String(cols));
    await page.screenshot({ path: `${SHOTS}/matches-${label}.png`, fullPage: true });

    // Keyboard + accessibility basics
    await page.keyboard.press("Tab");
    const focusable = await page.getByRole("link", { name: "Alpha CS Masters" }).evaluate((el) => { el.focus(); return document.activeElement === el; });
    await check("scholarship link is keyboard-focusable", focusable);
    await check("'How matching works' disclosure opens", (async () => { await page.getByText("How matching works").click(); return sees(page, "There is no score and no prediction"); })());
    await check("results/status regions are announced (role=status)", page.locator("[role=status]").count().then((n) => n >= 1));

    // Options: show other fields, include closed
    await page.getByRole("link", { name: /more in other fields or levels/ }).click();
    await page.waitForURL("**/matches?show=all");
    await check("show=all reveals the other-field scholarship", sees(page, "Beta Medicine Masters"));
    await page.getByRole("link", { name: /Include closed scholarships/ }).click();
    await page.waitForURL(/closed=1/);
    await check("closed scholarship appears, labelled 'Deadline passed'", sees(page, "Gamma Closed Scholarship") && sees(page, "Deadline passed"));
    await check("drafts/archived still absent with every option on", page.getByText("Secret Draft").count().then((n) => n === 0));

    // Detail link
    await page.goto(BASE + "/matches");
    await page.getByRole("link", { name: "Alpha CS Masters" }).click();
    await page.waitForURL(`**/scholarships/${U(1)}`);
    await check("card links to the existing scholarship detail route", page.url().endsWith(`/scholarships/${U(1)}`), page.url());
    await ctx.close();
  }

  console.log("States");
  {
    const c = await signup("ui-empty@example.com", { width: 1280, height: 900 });
    await c.page.goto(BASE + "/matches");
    await check("no education -> 'Add your education' state with a profile link, no scholarships", sees(c.page, "Add your education to see matches") && c.page.getByText("Alpha CS Masters").count().then((n) => n === 0) && c.page.getByRole("link", { name: "Add education to my profile" }).isVisible());
    await c.page.getByRole("link", { name: "Add education to my profile" }).click();
    await c.page.waitForURL("**/profile#education");
    await check("profile link lands on the Education section", c.page.locator("#education").waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false));
    await c.page.screenshot({ path: `${SHOTS}/matches-empty-profile.png` });
    await c.ctx.close();

    const p = await signup("ui-partial@example.com", { width: 1280, height: 900 });
    await mock("/_mock/set-education", { email: "ui-partial@example.com", education: [edu({ field: null, cgpa: null, cgpa_scale: null, expected_graduation: null })] });
    await p.page.goto(BASE + "/matches");
    await check("partial profile -> completion guidance and results", sees(p.page, "Complete your profile for more accurate matches") && sees(p.page, "Alpha CS Masters"));
    await check("missing info shown as 'needs information' (Repair Session 3), never 'not eligible' or 'eligible'", (await p.page.locator('[data-decision="needs_information"]').count()) > 0 && (await p.page.locator('[data-decision="not_eligible"]').count()) === 0 && (await p.page.locator('[data-decision="eligible"]').count()) === 0);
    await p.page.screenshot({ path: `${SHOTS}/matches-partial-profile.png`, fullPage: true });
    await p.ctx.close();

    await mock("/_mock/set-scholarships", []);
    const n = await signup("ui-none@example.com", { width: 1280, height: 900 });
    await mock("/_mock/set-education", { email: "ui-none@example.com", education: [edu({})] });
    await n.page.goto(BASE + "/matches");
    await check("no scholarships published -> useful empty state with browse link", sees(n.page, "No matching scholarships right now") && n.page.getByRole("link", { name: "Browse all scholarships" }).isVisible());
    await mock("/_mock/set-scholarships", SEED);
    await mock("/_mock/rest-fail", { fail: true });
    await n.page.goto(BASE + "/matches");
    await check("database failure -> generic message, no raw error", sees(n.page, "temporarily unavailable") && n.page.getByText("XX000").count().then((c) => c === 0) && n.page.getByText("mock:").count().then((c) => c === 0));
    await mock("/_mock/rest-fail", { fail: false });
    await n.ctx.close();
  }

  console.log("Access control and isolation (browser)");
  {
    const g = await browser.newContext(); const gp = await g.newPage();
    await gp.goto(BASE + "/matches");
    await check("guest is redirected to login (next preserved)", gp.waitForURL(/\/login\?next=%2Fmatches/, { timeout: 4000 }).then(() => true, () => false));
    await g.close();

    const A = await signup("iso-a@example.com", { width: 1280, height: 900 });
    const B = await signup("iso-b@example.com", { width: 1280, height: 900 });
    await mock("/_mock/set-education", { email: "iso-a@example.com", education: [edu({ cgpa: 3.6 })] });
    await mock("/_mock/set-education", { email: "iso-b@example.com", education: [edu({ cgpa: 2.1 })] });
    const dbB = await mock("/_mock/db", { email: "iso-b@example.com" });
    await A.page.goto(`${BASE}/matches?user_id=${dbB.userId}&profile_id=${dbB.profileId}`);
    await check("forged user/profile id in the URL still shows A's own data", sees(A.page, "3.6/4") && A.page.getByText("2.1/4").count().then((n) => n === 0));
    await B.page.goto(BASE + "/matches");
    await check("B sees B's data only", sees(B.page, "2.1/4") && B.page.getByText("3.6/4").count().then((n) => n === 0));
    await A.ctx.close(); await B.ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
