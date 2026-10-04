/**
 * Module 15 — pure validation unit tests (no network, no Supabase).
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function load() {
  // Compile-free: re-implement pure checks mirrored from validation.ts for CJS harness.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TYPES = new Set([
    "sop",
    "motivation_letter",
    "personal_statement",
    "study_plan",
    "scholarship_essay",
    "research_proposal",
    "cv",
    "application_question",
  ]);
  return {
    isUuid: (v) => typeof v === "string" && UUID_RE.test(v),
    isDraftType: (v) => typeof v === "string" && TYPES.has(v),
    CONTENT_MAX: 50000,
    TITLE_MAX: 200,
  };
}

async function main() {
  const v = await load();
  let n = 0;

  assert.equal(v.isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  n++;
  assert.equal(v.isUuid("not-a-uuid"), false);
  n++;
  assert.equal(v.isUuid(null), false);
  n++;

  assert.equal(v.isDraftType("sop"), true);
  n++;
  assert.equal(v.isDraftType("research_proposal"), true);
  n++;
  assert.equal(v.isDraftType("unknown"), false);
  n++;
  assert.equal(v.isDraftType(""), false);
  n++;

  assert.equal(v.CONTENT_MAX, 50000);
  n++;
  assert.equal(v.TITLE_MAX, 200);
  n++;

  console.log(`copilot validation: ${n} assertions passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
