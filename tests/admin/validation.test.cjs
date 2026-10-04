const assert = require("node:assert/strict");

const TARGETS = new Set([
  "mentor_story", "mentor_answer", "mentor_question", "mentor", "scholarship", "user", "other",
]);
const REASONS = new Set([
  "spam", "misinformation", "harassment", "inappropriate", "impersonation", "other",
]);
const STATUSES = new Set(["open", "reviewing", "resolved", "dismissed"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseReportInput(raw) {
  if (!TARGETS.has(raw.targetType)) return { ok: false };
  if (!REASONS.has(raw.reason)) return { ok: false };
  const targetId = typeof raw.targetId === "string" && UUID_RE.test(raw.targetId) ? raw.targetId : null;
  return { ok: true, targetType: raw.targetType, reason: raw.reason, targetId };
}

function main() {
  let n = 0;
  const ok = parseReportInput({
    targetType: "mentor_story",
    reason: "spam",
    targetId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assert.equal(ok.ok, true);
  n++;
  assert.equal(ok.targetId.length, 36);
  n++;
  assert.equal(parseReportInput({ targetType: "nope", reason: "spam" }).ok, false);
  n++;
  assert.equal(parseReportInput({ targetType: "other", reason: "bad" }).ok, false);
  n++;
  assert.ok(STATUSES.has("open"));
  n++;
  assert.ok(TARGETS.has("scholarship"));
  n++;
  console.log(`admin validation: ${n} assertions passed`);
}
main();
