// Module 14 static security checks.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS " + n); } catch (e) { fail++; console.log("  FAIL " + n + " - " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

const actions = read("src/lib/applications/actions.ts");
const queries = read("src/lib/applications/queries.ts");

t("actions are server actions; queries are server-only", () => {
  ok(/^"use server";/m.test(actions));
  ok(/^import "server-only";/m.test(queries));
});

t("identity from auth.getUser only; user_id never from form", () => {
  ok(/auth\.getUser\(\)/.test(actions));
  ok(!/formData\.get\(["']userId["']\)|formData\.get\(["']user_id["']\)/.test(actions));
  ok(/eq\("user_id", ctx\.userId\)|eq\("user_id", userId\)|user_id: ctx\.userId/.test(actions + queries));
});

t("no service role / admin client in applications module", () => {
  const dir = path.join(root, "src/lib/applications");
  for (const f of fs.readdirSync(dir)) {
    const s = read("src/lib/applications/" + f);
    ok(!/createAdminClient|SERVICE_ROLE|getSupabaseServiceRoleKey|service_role/.test(s), f);
  }
});

t("startApplication only inserts allow-listed columns", () => {
  ok(/insert\(\{ user_id: ctx\.userId, scholarship_id: scholarshipId, status: "planning" \}\)/.test(actions));
});

t("status/notes/task updates scoped by owner", () => {
  ok(/\.eq\("id", id\)\.eq\("user_id", ctx\.userId\)/.test(actions));
  ok(/\.eq\("application_id", applicationId\)/.test(actions));
});

t("pages exist under protected applications routes", () => {
  ok(fs.existsSync(path.join(root, "src/app/(protected)/applications/page.tsx")));
  ok(fs.existsSync(path.join(root, "src/app/(protected)/applications/[id]/page.tsx")));
});

t("/applications is a protected prefix", () => {
  ok(/\/applications/.test(read("src/lib/auth/routes.ts")));
});

t("no client component imports queries", () => {
  const walk = (d) => {
    const out = [];
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) out.push(...walk(p));
      else if (/\.(tsx?)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const bad = walk("src/components").filter((f) => {
    const s = read(f);
    return /lib\/applications\/queries|lib\/applications\/actions/.test(s) && !/workspace-forms|start-application/.test(f);
  });
  // workspace-forms and start-application may import actions (server actions) — OK
  const offenders = walk("src/components").filter((f) => /lib\/applications\/queries/.test(read(f)));
  ok(offenders.length === 0, "queries imported from: " + offenders.join(","));
});

console.log(`\napplications static: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
