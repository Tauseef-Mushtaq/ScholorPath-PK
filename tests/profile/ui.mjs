import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = "http://localhost:3200", MOCK = "http://127.0.0.1:54321";
const mock = async (p, body) => (await fetch(MOCK + p, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })).json();
let pass = 0, fail = 0;
let current = null; // page used for failure diagnostics
const check = async (name, cond, extra = "") => {
  if (await cond) { pass++; console.log("  PASS", name); return; }
  fail++; console.log("  FAIL", name, extra);
  if (current && process.env.UI_DEBUG) console.log((await current.locator("main").innerText().catch(() => "")).slice(0, 1200));
};
const sees = async (page, text, ms = 4000) => page.getByText(text, { exact: false }).first().waitFor({ timeout: ms }).then(() => true, () => false);
const gone = async (page, text, ms = 4000) => page.getByText(text, { exact: false }).first().waitFor({ state: "detached", timeout: ms }).then(() => true, () => false);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
async function signup(email) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(BASE + "/signup");
  await page.fill("#email", email); await page.fill("#password", "Correct-horse-1"); await page.fill("#confirmPassword", "Correct-horse-1");
  await page.click("button[type=submit]"); await page.waitForURL("**/dashboard");
  await page.goto(BASE + "/profile");
  return { ctx, page };
}

try {
  const A = await signup("ui-a@example.com");
  const a = A.page; current = a;

  console.log("Profile");
  await check("profile page loads with form open for a new profile", await sees(a, "Personal information") && await a.locator("#full_name").isVisible());
  await a.click("button:has-text('Save profile')");
  await check("empty name -> inline server validation", await sees(a, "Full name is required."));
  await a.fill("#full_name", "Alice Student"); await a.fill("#nationality", "Pakistani"); await a.fill("#city", "Lahore");
  await a.click("button:has-text('Save profile')");
  await check("profile saved with success message", await sees(a, "Profile saved."));
  await check("saved values shown in read mode", await sees(a, "Alice Student") && await sees(a, "Lahore") && !(await a.locator("#full_name").count()));
  await a.click("button:has-text('Edit')");
  await check("Edit reopens the form with current values", (await a.inputValue("#city")) === "Lahore");
  await a.fill("#city", ""); await a.click("button:has-text('Cancel')");
  await check("Cancel discards changes", await sees(a, "Lahore"));

  console.log("Education");
  await check("empty state", await sees(a, "No education records yet. Add your education history to improve your scholarship matches."));
  await a.click("button:has-text('Add education')");
  await a.click("button:has-text('Add education') >> nth=-1");
  await check("required errors", await sees(a, "Level is required.") && await sees(a, "Institution is required."));
  await a.selectOption("#edu-level", "bachelor"); await a.fill("#edu-institution", "NUST");
  await a.fill("#edu-cgpa", "5"); await a.fill("#edu-scale", "4");
  await a.click("button:has-text('Add education') >> nth=-1");
  await check("cgpa above scale rejected", await sees(a, "CGPA cannot be higher than the scale."));
  await check("form values survive a failed submit", (await a.inputValue("#edu-institution")) === "NUST");
  await a.fill("#edu-cgpa", "3.5");
  await a.click("button:has-text('Add education') >> nth=-1");
  await check("education added", await sees(a, "Education added.") && await sees(a, "CGPA 3.5 / 4"));
  await a.click("button:has-text('Add education')");
  await a.selectOption("#edu-level", "master"); await a.fill("#edu-institution", "LUMS");
  await a.click("button:has-text('Add education') >> nth=-1");
  await check("second education added", await sees(a, "LUMS"));
  await a.click("button[aria-label='Edit NUST']");
  await a.fill("#edu-institution", "NUST Islamabad"); await a.click("button:has-text('Save changes')");
  await check("education edited", await sees(a, "Education updated.") && await sees(a, "NUST Islamabad"));
  await a.click("button[aria-label='Delete LUMS']");
  await check("delete asks for confirmation first", await sees(a, "Delete this permanently?") && await sees(a, "LUMS"));
  await a.click("button:has-text('Cancel')");
  await check("cancel keeps the record", await sees(a, "LUMS") && !(await a.getByText("Delete this permanently?").count()));
  await a.click("button[aria-label='Delete LUMS']"); await a.click("button:has-text('Yes, delete')");
  await check("confirmed delete removes the record", await gone(a, "LUMS"));
  await check("completion updated", await sees(a, "Profile completeness: 100%"));

  console.log("Experience");
  await check("empty experience state", await sees(a, "No experience added yet"));
  await a.click("button:has-text('Add experience')");
  await a.click("button:has-text('Add experience') >> nth=-1");
  await check("experience required errors", await sees(a, "Type is required.") && await sees(a, "Title is required."));
  await a.selectOption("#exp-type", "internship"); await a.fill("#exp-title", "Software Intern"); await a.fill("#exp-org", "Acme");
  await a.fill("#exp-start", "2022-06-01"); await a.fill("#exp-end", "2022-01-01");
  await a.click("button:has-text('Add experience') >> nth=-1");
  await check("end before start rejected", await sees(a, "End date cannot be before the start date."));
  await a.fill("#exp-end", "2022-08-31"); await a.fill("#exp-desc", "Built things.");
  await a.click("button:has-text('Add experience') >> nth=-1");
  await check("experience added", await sees(a, "Experience added.") && await sees(a, "Software Intern"));
  await a.click("button[aria-label='Edit Software Intern']"); await a.fill("#exp-title", "Senior Intern"); await a.click("button:has-text('Save changes')");
  await check("experience edited", await sees(a, "Senior Intern"));
  await a.click("button[aria-label='Delete Senior Intern']"); await a.click("button:has-text('Yes, delete')");
  await check("experience deleted", await gone(a, "Senior Intern"));

  console.log("Cross-user (forged record ids from the browser)");
  const dbA = await mock("/_mock/db", { email: "ui-a@example.com" });
  const aEdu = dbA.education[0];
  await check("setup: user A has one education record", dbA.education.length === 1 && aEdu.institution === "NUST Islamabad");
  const Bs = await signup("ui-b@example.com"); const b = Bs.page;
  await b.fill("#full_name", "Bob"); await b.click("button:has-text('Save profile')"); await sees(b, "Profile saved.");
  await check("user B sees none of A's data", !(await b.getByText("NUST Islamabad").count()) && !(await b.getByText("Alice Student").count()));
  await b.click("button:has-text('Add education')");
  await b.selectOption("#edu-level", "bachelor"); await b.fill("#edu-institution", "B University");
  await b.click("button:has-text('Add education') >> nth=-1"); await sees(b, "B University");
  // Forge: edit B's own record but swap the hidden id for A's record id.
  await b.click("button[aria-label='Edit B University']");
  await b.evaluate((id) => { document.querySelector("input[name=id]").value = id; }, aEdu.id);
  await b.fill("#edu-institution", "HACKED"); await b.click("button:has-text('Save changes')");
  await check("forged update of A's record is refused", await sees(b, "could not be found"));
  // Forge: delete with A's id.
  await b.reload();
  await b.click("button[aria-label='Delete B University']");
  await b.evaluate((id) => { document.querySelector("form[role=group] input[name=id]").value = id; }, aEdu.id);
  await b.click("button:has-text('Yes, delete')");
  await check("forged delete of A's record is refused", await sees(b, "could not be found"));
  const after = await mock("/_mock/db", { email: "ui-a@example.com" });
  await check("A's education untouched by B", after.education.length === 1 && after.education[0].institution === "NUST Islamabad");
  const dbB = await mock("/_mock/db", { email: "ui-b@example.com" });
  await check("B's own record untouched", dbB.education.length === 1 && dbB.education[0].institution === "B University");
  await check("roles unchanged", after.role === "student" && dbB.role === "student");

  console.log("No secrets / DB internals reach the browser");
  const html = await a.content();
  await check("no service-role / server env in page", !/service_role|SERVICE_ROLE|SUPABASE_SERVICE/.test(html));
  await check("no raw DB error text", !/PGRST|XX000|violates|mock:/.test(html));
} catch (e) {
  fail++; console.log("  FAIL unexpected error:", e.message);
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
