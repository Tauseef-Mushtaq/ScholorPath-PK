const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function main() {
  let n = 0;
  const files = [
    "supabase/migrations/20261003000500_reports_and_hardening.sql",
    "src/lib/admin/constants.ts",
    "src/lib/admin/queries.ts",
    "src/lib/admin/actions.ts",
    "src/lib/admin/validation.ts",
    "src/components/admin/admin-nav.tsx",
    "src/components/admin/admin-forms.tsx",
    "src/app/(protected)/admin/page.tsx",
    "src/app/(protected)/admin/users/page.tsx",
    "src/app/(protected)/admin/reports/page.tsx",
    "src/app/(protected)/admin/rag/page.tsx",
    "src/app/(protected)/admin/sources/page.tsx",
    "src/app/(protected)/admin/audit/page.tsx",
    "src/app/(protected)/admin/settings/page.tsx",
  ];
  for (const f of files) {
    assert.ok(exists(f), `missing ${f}`);
    n++;
  }

  const mig = read("supabase/migrations/20261003000500_reports_and_hardening.sql");
  assert.ok(mig.includes("create table public.reports"));
  n++;
  assert.ok(mig.includes("enable row level security"));
  n++;
  assert.ok(mig.includes("is_admin()"));
  n++;
  assert.ok(mig.includes("reporter_user_id = (select auth.uid())"));
  n++;

  const actions = read("src/lib/admin/actions.ts");
  assert.ok(actions.includes("requireRole([\"admin\"])") || actions.includes("requireRole(['admin'])"));
  n++;
  assert.ok(actions.includes("requireUser"));
  n++;
  assert.ok(!actions.includes("service_role") && !actions.includes("createAdminClient"));
  n++;

  const queries = read("src/lib/admin/queries.ts");
  assert.ok(queries.includes('import "server-only"'));
  n++;

  for (const page of [
    "src/app/(protected)/admin/page.tsx",
    "src/app/(protected)/admin/users/page.tsx",
    "src/app/(protected)/admin/reports/page.tsx",
    "src/app/(protected)/admin/settings/page.tsx",
  ]) {
    const t = read(page);
    assert.ok(t.includes("requireRole"), `${page} must require role`);
    n++;
  }

  const cfg = read("next.config.ts");
  assert.ok(cfg.includes("X-Frame-Options"));
  n++;
  assert.ok(cfg.includes("X-Content-Type-Options"));
  n++;
  assert.ok(cfg.includes("Referrer-Policy"));
  n++;

  const health = read("src/app/api/health/route.ts");
  assert.ok(!health.includes("API_KEY") || health.includes("Boolean("));
  n++;
  assert.ok(!/GEMINI_API_KEY\s*[,}]/.test(health.replace(/\s/g, "")) || health.includes("Boolean"));
  n++;
  // never leak key value
  assert.ok(!health.includes("process.env.GEMINI_API_KEY,") && !health.includes("process.env.GEMINI_API_KEY }"));
  n++;

  console.log(`admin security-static: ${n} assertions passed`);
}
main();
