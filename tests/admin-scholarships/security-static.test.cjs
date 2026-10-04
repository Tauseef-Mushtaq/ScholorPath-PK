// Static security checks for Module 07 source files (no runtime; proves structure only, not live behaviour).
const fs = require("node:fs"); const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const actions = read("src/lib/admin-scholarships/actions.ts");
const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
t("actions file is a use-server module with exports", () => { ok(actions.startsWith('"use server"'), "missing use server"); ok(exported.length >= 9, `only ${exported.length} exports`); });
for (const fn of exported) t(`${fn} calls adminContext() before any DB access`, () => {
  const body = actions.split(`export async function ${fn}(`)[1].split(/\nexport async function /)[0];
  const ctxAt = body.indexOf("await adminContext()"); ok(ctxAt >= 0, "no adminContext");
  const dbAt = body.search(/ctx\.supabase|supabase\./); ok(dbAt < 0 || ctxAt < dbAt, "DB used before auth");
});
t("adminContext verifies user and reads role from profiles", () => { ok(/auth\.getUser\(\)/.test(actions) && /fetchUserRole/.test(actions) && /role !== "admin"/.test(actions), "missing"); });
t("no service-role client in module 07", () => { for (const f of ["actions.ts", "queries.ts", "import.ts", "validation.ts"]) ok(!/supabase\/admin|createAdminClient|SERVICE_ROLE/.test(read(`src/lib/admin-scholarships/${f}`)), f); });
t("no raw db error text returned to users", () => ok(!/error:\s*(error|\w+Err|\w+)\.message/.test(actions) && !/\.message\s*[,}]/.test(actions.replace(/\/\/.*$/gm, "")), "raw message returned"));
t("create always inserts status draft", () => ok(/insert\(\{ \.\.\.v\.data, status: "draft" \}\)/.test(actions), "create may not be draft"));
t("update never sets status", () => { const b = actions.split("export async function updateScholarship(")[1].split(/\nexport async function /)[0]; ok(!/status/.test(b.replace(/Status/g, "")), "update touches status"); });
t("status change uses transition table + optimistic condition", () => ok(/canTransition\(from, to\)/.test(actions) && /\.eq\("status", from\)/.test(actions), "missing"));
t("delete checks applications and active status", () => { const b = actions.split("export async function deleteScholarship(")[1]; ok(/from\("applications"\)/.test(b) && /=== "active"/.test(b), "missing"); });
t("import forces draft", () => ok(/status: "draft"/.test(actions.split("export async function importScholarships(")[1]), "import not draft"));

for (const p of ["src/app/(protected)/admin/page.tsx", "src/app/(protected)/admin/scholarships/page.tsx", "src/app/(protected)/admin/scholarships/new/page.tsx", "src/app/(protected)/admin/scholarships/import/page.tsx", "src/app/(protected)/admin/scholarships/[id]/page.tsx"])
  t(`${p.replace("src/app/(protected)/", "")} calls requireRole(["admin"]) first`, () => { const s = read(p); const i = s.indexOf('requireRole(["admin"])'); ok(i >= 0, "no guard"); ok(!/getAdminScholarship|list\w+\(/.test(s.slice(0, i).split("export default")[1] ?? ""), "data before guard"); });

t("client components never import server-only modules or service role", () => {
  for (const f of fs.readdirSync(path.join(root, "src/components/admin-scholarships"))) { const s = read(`src/components/admin-scholarships/${f}`); ok(!/server-only|supabase\/(admin|server)|env\.server/.test(s), f); }
});
t("public queries unchanged: anon client, no service role", () => { const q = read("src/lib/public/queries.ts"); ok(/createPublicClient/.test(q) && !/createAdminClient|supabase\/admin/.test(q), "public queries changed"); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
