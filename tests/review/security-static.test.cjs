/**
 * Module 16 — static security / architecture checks for Application Review.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function main() {
  let n = 0;

  // Core files exist
  const files = [
    "src/lib/review/constants.ts",
    "src/lib/review/types.ts",
    "src/lib/review/completeness.ts",
    "src/lib/review/consistency.ts",
    "src/lib/review/deadline.ts",
    "src/lib/review/eligibility-items.ts",
    "src/lib/review/health.ts",
    "src/lib/review/service.server.ts",
    "src/lib/review/index.ts",
    "src/components/review/review-panel.tsx",
  ];
  for (const f of files) {
    assert.ok(exists(f), `missing ${f}`);
    n++;
  }

  // Pure modules must not import server-only or supabase
  for (const f of [
    "src/lib/review/constants.ts",
    "src/lib/review/completeness.ts",
    "src/lib/review/consistency.ts",
    "src/lib/review/deadline.ts",
    "src/lib/review/eligibility-items.ts",
    "src/lib/review/health.ts",
  ]) {
    const t = read(f);
    assert.ok(!t.includes("server-only"), `${f} must stay pure`);
    n++;
    assert.ok(!t.includes("@supabase"), `${f} must not touch supabase`);
    n++;
    assert.ok(!t.includes("process.env"), `${f} must not read env`);
    n++;
  }

  // service.server is server-only
  const svc = read("src/lib/review/service.server.ts");
  assert.ok(svc.includes('import "server-only"'), "service must be server-only");
  n++;
  assert.ok(svc.includes("loadOwnDocuments"), "service loads own documents");
  n++;
  assert.ok(svc.includes("loadOwnProfile"), "service loads own profile");
  n++;
  assert.ok(svc.includes("evaluateScholarship"), "service uses matching engine");
  n++;
  assert.ok(!svc.includes("createAdminClient") && !svc.includes("service_role"), "no service role");
  n++;

  // UI is present on application detail
  const page = read("src/app/(protected)/applications/[id]/page.tsx");
  assert.ok(page.includes("ReviewPanel"), "detail page renders ReviewPanel");
  n++;
  assert.ok(page.includes("loadApplicationHealth"), "detail page loads health");
  n++;

  // No new API route inventing submission
  const apiDir = path.join(ROOT, "src/app/api");
  if (fs.existsSync(apiDir)) {
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name === "route.ts") {
          const t = fs.readFileSync(p, "utf8");
          assert.ok(!/submitApplication|auto.?submit/i.test(t), `no auto-submit in ${p}`);
          n++;
        }
      }
    };
    walk(apiDir);
  }

  // Component does not call AI
  const panel = read("src/components/review/review-panel.tsx");
  assert.ok(!panel.includes("gemini") && !panel.includes("openai"), "panel is not AI");
  n++;
  assert.ok(panel.includes("ScholarPath does not submit"), "submit disclaimer present");
  n++;

  // index re-exports pure API
  const idx = read("src/lib/review/index.ts");
  assert.ok(idx.includes("buildApplicationHealth"));
  n++;
  assert.ok(idx.includes("extractGpaMentions"));
  n++;

  console.log(`review security-static: ${n} assertions passed`);
}

main();
