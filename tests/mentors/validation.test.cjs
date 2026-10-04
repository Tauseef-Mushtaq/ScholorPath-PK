/**
 * Module 17 — pure validation tests (no network).
 */
const assert = require("node:assert/strict");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

function parseApplyInput(raw) {
  const degreeLevel =
    typeof raw.degreeLevel === "string" && raw.degreeLevel.trim()
      ? raw.degreeLevel.trim().slice(0, 100)
      : null;
  const field =
    typeof raw.field === "string" && raw.field.trim() ? raw.field.trim().slice(0, 200) : null;
  let awardYear = null;
  if (raw.awardYear !== undefined && raw.awardYear !== null && raw.awardYear !== "") {
    const n = typeof raw.awardYear === "number" ? raw.awardYear : Number(raw.awardYear);
    if (!Number.isInteger(n) || n < 1900 || n > 2100) return { ok: false, message: "year" };
    awardYear = n;
  }
  const scholarshipId =
    typeof raw.scholarshipId === "string" && isUuid(raw.scholarshipId) ? raw.scholarshipId : null;
  return { ok: true, degreeLevel, field, awardYear, scholarshipId };
}

function parseStoryInput(raw) {
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
  const body = typeof raw.body === "string" ? raw.body.trim().slice(0, 50000) : "";
  if (title.length < 3) return { ok: false };
  if (body.length < 20) return { ok: false };
  const status = ["draft", "published", "archived"].includes(raw.status) ? raw.status : "draft";
  return { ok: true, title, body, status };
}

function parseQuestionInput(raw) {
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
  const body = typeof raw.body === "string" ? raw.body.trim().slice(0, 4000) : "";
  if (title.length < 5) return { ok: false };
  if (body.length < 10) return { ok: false };
  return { ok: true, title, body };
}

function main() {
  let n = 0;
  assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  n++;
  assert.equal(isUuid("nope"), false);
  n++;

  const a = parseApplyInput({ degreeLevel: "Master's", field: "CS", awardYear: "2024" });
  assert.equal(a.ok, true);
  assert.equal(a.awardYear, 2024);
  n += 2;

  const badYear = parseApplyInput({ awardYear: 1800 });
  assert.equal(badYear.ok, false);
  n++;

  const story = parseStoryInput({ title: "My journey", body: "x".repeat(25), status: "published" });
  assert.equal(story.ok, true);
  assert.equal(story.status, "published");
  n += 2;

  const short = parseStoryInput({ title: "ab", body: "short" });
  assert.equal(short.ok, false);
  n++;

  const q = parseQuestionInput({ title: "How to prepare?", body: "What documents did you need?" });
  assert.equal(q.ok, true);
  n++;

  const qBad = parseQuestionInput({ title: "Hi", body: "too short" });
  assert.equal(qBad.ok, false);
  n++;

  console.log(`mentors validation: ${n} assertions passed`);
}
main();
