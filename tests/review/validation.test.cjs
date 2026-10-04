/**
 * Module 16 — pure review engine unit tests (no network, no Supabase).
 * Mirrors logic from src/lib/review for CJS harness.
 */
const assert = require("node:assert/strict");

const CORE_WRITING = new Set(["sop", "motivation_letter", "personal_statement", "research_proposal"]);
const EXPECTED_DOCS = [
  { value: "passport", required: true },
  { value: "transcript", required: true },
  { value: "cv", required: true },
  { value: "degree_certificate", required: false },
];

function extractGpaMentions(text) {
  const out = [];
  const re = /\b([0-4](?:\.\d{1,2})?)\s*(?:\/\s*([0-9]+(?:\.\d+)?))?\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 4.5) out.push(n);
  }
  return out;
}

function daysUntil(deadlineIso, todayIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineIso) || !/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) return null;
  const t0 = Date.parse(`${todayIso}T00:00:00Z`);
  const t1 = Date.parse(`${deadlineIso}T00:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return Math.round((t1 - t0) / 86_400_000);
}

function buildHealth(input) {
  const items = [];
  // profile
  if (!input.profile.hasProfile) {
    items.push({ severity: "blocker", id: "profile-missing" });
  } else if (input.profile.educationCount === 0) {
    items.push({ severity: "blocker", id: "profile-education" });
  } else {
    items.push({ severity: "ok", id: "profile-education-ok" });
  }
  // docs
  const types = new Set(input.documents.map((d) => (d.documentType || "").toLowerCase()).filter(Boolean));
  for (const e of EXPECTED_DOCS) {
    if (!types.has(e.value) && e.required) items.push({ severity: "warn", id: `doc-${e.value}` });
  }
  // writing
  let hasCore = false;
  let hasApproved = false;
  for (const d of input.drafts) {
    if (CORE_WRITING.has(d.draftType)) {
      hasCore = true;
      if (d.userApproved && d.content.trim().length > 50) hasApproved = true;
    }
  }
  if (!hasCore) items.push({ severity: "warn", id: "writing-none" });
  else if (!hasApproved) items.push({ severity: "warn", id: "writing-unapproved" });
  else items.push({ severity: "ok", id: "writing-ready" });
  // deadline
  if (input.scholarship.deadline) {
    const days = daysUntil(input.scholarship.deadline, input.todayIso);
    if (days != null && days < 0) items.push({ severity: "blocker", id: "deadline-passed" });
  }
  // consistency GPA
  if (input.profile.maxCgpa != null) {
    const mentions = input.drafts.flatMap((d) => extractGpaMentions(d.content));
    if (mentions.some((g) => Math.abs(g - input.profile.maxCgpa) > 0.35)) {
      items.push({ severity: "warn", id: "consistency-gpa" });
    }
  }
  // eligibility
  if (input.eligibility && input.eligibility.decision === "not_eligible") {
    items.push({ severity: "blocker", id: "eligibility-not" });
  }

  let score = 100;
  let blockers = 0;
  let warnings = 0;
  for (const i of items) {
    if (i.severity === "blocker") {
      blockers++;
      score -= 25;
    } else if (i.severity === "warn") {
      warnings++;
      score -= 8;
    }
  }
  if (score < 0) score = 0;
  let overall = "ready";
  if (blockers > 0 || score < 40) overall = "not_ready";
  else if (warnings > 0 || score < 75) overall = "needs_work";
  return { overall, score, items, blockers, warnings };
}

function main() {
  let n = 0;

  // extractGpaMentions
  assert.deepEqual(extractGpaMentions("CGPA 3.70/4.0"), [3.7]);
  n++;
  assert.ok(extractGpaMentions("score was 2.1").includes(2.1));
  n++;
  assert.equal(extractGpaMentions("year 2020").length, 0);
  n++;

  // daysUntil
  assert.equal(daysUntil("2026-10-10", "2026-10-03"), 7);
  n++;
  assert.ok(daysUntil("2026-09-01", "2026-10-03") < 0);
  n++;
  assert.equal(daysUntil("bad", "2026-10-03"), null);
  n++;

  // healthy baseline
  const healthy = buildHealth({
    todayIso: "2026-10-03",
    profile: {
      hasProfile: true,
      educationCount: 1,
      maxCgpa: 3.5,
      maxCgpaScale: 4,
    },
    documents: [
      { documentType: "passport" },
      { documentType: "transcript" },
      { documentType: "cv" },
    ],
    drafts: [
      {
        draftType: "sop",
        content: "I graduated with CGPA 3.5 in computer science after years of study.",
        userApproved: true,
      },
    ],
    scholarship: { deadline: "2026-12-01", status: "active" },
    eligibility: { decision: "eligible" },
  });
  assert.equal(healthy.overall, "ready");
  n++;
  assert.ok(healthy.score >= 75);
  n++;
  assert.equal(healthy.blockers, 0);
  n++;

  // missing profile education -> blocker
  const noEdu = buildHealth({
    todayIso: "2026-10-03",
    profile: { hasProfile: true, educationCount: 0, maxCgpa: null },
    documents: [],
    drafts: [],
    scholarship: { deadline: null, status: "active" },
    eligibility: null,
  });
  assert.equal(noEdu.overall, "not_ready");
  n++;
  assert.ok(noEdu.blockers >= 1);
  n++;

  // past deadline
  const past = buildHealth({
    todayIso: "2026-10-03",
    profile: { hasProfile: true, educationCount: 1, maxCgpa: null },
    documents: [{ documentType: "passport" }, { documentType: "transcript" }, { documentType: "cv" }],
    drafts: [{ draftType: "sop", content: "x".repeat(60), userApproved: true }],
    scholarship: { deadline: "2026-01-01", status: "active" },
    eligibility: { decision: "eligible" },
  });
  assert.ok(past.items.some((i) => i.id === "deadline-passed"));
  n++;
  assert.equal(past.overall, "not_ready");
  n++;

  // GPA mismatch
  const gpa = buildHealth({
    todayIso: "2026-10-03",
    profile: { hasProfile: true, educationCount: 1, maxCgpa: 3.8 },
    documents: [{ documentType: "passport" }, { documentType: "transcript" }, { documentType: "cv" }],
    drafts: [
      {
        draftType: "sop",
        content: "My CGPA is 2.1 which is below average but I improved.",
        userApproved: true,
      },
    ],
    scholarship: { deadline: "2026-12-01", status: "active" },
    eligibility: { decision: "eligible" },
  });
  assert.ok(gpa.items.some((i) => i.id === "consistency-gpa"));
  n++;
  assert.equal(gpa.overall, "needs_work");
  n++;

  // not eligible
  const ne = buildHealth({
    todayIso: "2026-10-03",
    profile: { hasProfile: true, educationCount: 1, maxCgpa: null },
    documents: [{ documentType: "passport" }, { documentType: "transcript" }, { documentType: "cv" }],
    drafts: [{ draftType: "sop", content: "x".repeat(60), userApproved: true }],
    scholarship: { deadline: "2026-12-01", status: "active" },
    eligibility: { decision: "not_eligible" },
  });
  assert.equal(ne.overall, "not_ready");
  n++;

  console.log(`review validation: ${n} assertions passed`);
}

main();
