// Module 14 pure validation tests (no DB).
const path = require("node:path");
const assert = require("node:assert/strict");

// Compile path expected: out dir with applications/*.js OR we require from a small inline by reading TS via dynamic - use compiled if available.
const out = process.argv[2];
let V;
try {
  V = require(path.join(out, "applications", "validation.js"));
} catch {
  try {
    V = require(path.join(out, "validation.js"));
  } catch (e) {
    console.error("Need compiled applications/validation.js at", out);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message); } };

t("uuid", () => {
  assert.equal(V.isUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(V.isUuid("not-a-uuid"), false);
  assert.equal(V.isUuid(null), false);
});

t("application status allow-list", () => {
  assert.equal(V.parseApplicationStatus("planning"), "planning");
  assert.equal(V.parseApplicationStatus("submitted"), "submitted");
  assert.equal(V.parseApplicationStatus("hacking"), null);
  assert.equal(V.parseApplicationStatus(""), null);
});

t("task status allow-list", () => {
  assert.equal(V.parseTaskStatus("todo"), "todo");
  assert.equal(V.parseTaskStatus("done"), "done");
  assert.equal(V.parseTaskStatus("deleted"), null);
});

t("notes length and control chars", () => {
  assert.deepEqual(V.parseNotes(""), { ok: true, value: null });
  assert.deepEqual(V.parseNotes("  hello  "), { ok: true, value: "hello" });
  const big = "x".repeat(4001);
  assert.equal(V.parseNotes(big).ok, false);
});

t("task title min length", () => {
  assert.equal(V.parseTaskTitle("ab"), null);
  assert.equal(V.parseTaskTitle("Upload CV"), "Upload CV");
});

t("status side effects", () => {
  assert.deepEqual(V.statusSideEffects("in_progress", "planning"), { startedAt: true });
  assert.deepEqual(V.statusSideEffects("submitted", "planning"), { submittedAt: true });
  assert.deepEqual(V.statusSideEffects("planning", "submitted"), { clearSubmittedAt: true });
});

console.log(`\napplications validation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
