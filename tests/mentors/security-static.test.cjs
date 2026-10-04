/**
 * Module 17 — static security / architecture checks.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function main() {
  let n = 0;
  const files = [
    "supabase/migrations/20261003000400_mentor_community.sql",
    "src/lib/mentors/constants.ts",
    "src/lib/mentors/types.ts",
    "src/lib/mentors/validation.ts",
    "src/lib/mentors/queries.ts",
    "src/lib/mentors/actions.ts",
    "src/components/mentors/mentor-forms.tsx",
    "src/app/(protected)/mentor/apply/page.tsx",
    "src/app/(protected)/mentor/dashboard/page.tsx",
    "src/app/(protected)/admin/mentors/page.tsx",
    "src/app/mentors/[id]/page.tsx",
  ];
  for (const f of files) {
    assert.ok(exists(f), `missing ${f}`);
    n++;
  }

  const mig = read("supabase/migrations/20261003000400_mentor_community.sql");
  assert.ok(mig.includes("mentor_stories"), "stories table");
  n++;
  assert.ok(mig.includes("mentor_timelines"), "timelines table");
  n++;
  assert.ok(mig.includes("mentor_questions"), "questions table");
  n++;
  assert.ok(mig.includes("mentor_answers"), "answers table");
  n++;
  assert.ok(mig.includes("enable row level security"), "RLS enabled");
  n++;
  assert.ok(mig.includes("owns_mentor"), "owns_mentor helper");
  n++;
  assert.ok(mig.includes("is_verified_mentor"), "is_verified_mentor helper");
  n++;
  assert.ok(mig.includes("mentors_update_admin"), "admin update policy");
  n++;
  assert.ok(mig.includes("verification_status"), "verification grants");
  n++;

  // pure validation no server
  const val = read("src/lib/mentors/validation.ts");
  assert.ok(!val.includes("server-only") && !val.includes("@supabase"), "validation pure");
  n++;

  const actions = read("src/lib/mentors/actions.ts");
  assert.ok(actions.includes('"use server"'), "server actions");
  n++;
  assert.ok(actions.includes("requireUser") || actions.includes("requireRole"), "auth guards");
  n++;
  assert.ok(!actions.includes("createAdminClient") && !actions.includes("service_role"), "no service role client");
  n++;
  assert.ok(actions.includes("requireRole([\"admin\"])") || actions.includes("requireRole(['admin'])"), "admin gate");
  n++;

  const queries = read("src/lib/mentors/queries.ts");
  assert.ok(queries.includes('import "server-only"'), "queries server-only");
  n++;
  assert.ok(queries.includes("eq(\"user_id\", userId)") || queries.includes(".eq(\"user_id\""), "own filter");
  n++;

  const publicPage = read("src/app/mentors/page.tsx");
  assert.ok(publicPage.includes("PERSONAL_EXPERIENCE_LABEL") || publicPage.includes("personal experience"), "disclaimer");
  n++;
  assert.ok(publicPage.includes("loadVerifiedMentors"), "lists mentors");
  n++;

  const detail = read("src/app/mentors/[id]/page.tsx");
  assert.ok(detail.includes("PERSONAL_EXPERIENCE_LABEL") || detail.includes("Personal experience"), "detail disclaimer");
  n++;

  const dash = read("src/app/(protected)/mentor/dashboard/page.tsx");
  assert.ok(dash.includes("verificationStatus !== \"verified\"") || dash.includes("verification_status"), "verified gate");
  n++;

  console.log(`mentors security-static: ${n} assertions passed`);
}
main();
