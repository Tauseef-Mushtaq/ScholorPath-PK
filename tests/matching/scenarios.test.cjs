// Repair Session 3 — realistic student scenarios against the PURE engine (no database).
// Expectations come from the product brief: eligible / not eligible / unknown / needs information.
const assert = require("node:assert/strict");
const path = require("node:path");
const M = require(path.join(process.argv[2], "index.js"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", String(e.message).split("\n")[0]); } };
const TODAY = "2026-10-03";

const edu = (o = {}) => ({ level: "bachelor", field: "Computer Science", cgpa: 3.6, cgpaScale: 4, startDate: "2020-09-01", expectedGraduation: "2024-06-30", ...o });
const profile = (...e) => ({ nationality: "Pakistani", education: e });
const sch = (o = {}) => ({
  id: "s-" + Math.random().toString(36).slice(2, 8), name: "Test Scholarship", provider: "Provider", status: "active",
  degreeLevel: "Master", field: "Computer Science", fundingType: "fully_funded", deadline: "2027-03-01",
  country: { name: "Testland", slug: "testland" }, university: null, minimumGpa: 3.0, minimumGpaScale: 4,
  englishRequirementSummary: null, eligibilitySummary: null, requirements: [], ...o,
});
const ev = (p, s) => M.evaluateScholarship(p, s, TODAY);
const run = (p, c, o = {}) => M.buildMatches(p, c, TODAY, { includeClosed: false, showAll: false, ...o });

console.log("Student A — matching degree + field + GPA");
t("A is eligible (decision) / likely_eligible (status) with every checkable criterion met", () => {
  const r = ev(profile(edu()), sch());
  assert.equal(r.decision, "eligible"); assert.equal(r.status, "likely_eligible");
  for (const k of ["degree_level", "gpa", "field"]) assert.equal(r.checks.find((c) => c.key === k).outcome, "met", k);
});
t("A sees the matching scholarship first and the unrelated one is not shown", () => {
  const good = sch({ id: "good" }), law = sch({ id: "law", field: "Law" });
  const s = run(profile(edu()), [law, good]);
  assert.deepEqual(s.results.map((r) => r.scholarship.id), ["good"]);
  assert.equal(s.counts.hiddenNotRelevant, 1); assert.equal(s.counts.byDecision.eligible, 1);
});
t("A: 'eligible' still never claims unchecked things (summaries stay info-only)", () => {
  const r = ev(profile(edu()), sch({ englishRequirementSummary: "IELTS 6.5", eligibilitySummary: "Under 30 years" }));
  assert.equal(r.decision, "eligible");
  assert.ok(r.checks.filter((c) => c.outcome === "info").every((c) => !c.mandatory));
  assert.match(M.DECISION_DESCRIPTION.eligible, /not checked/i);
});

console.log("Student B — wrong degree");
t("B (Master's holder) vs Bachelor's scholarship -> not_eligible", () => {
  const r = ev(profile(edu({ level: "master" })), sch({ degreeLevel: "Bachelor" }));
  assert.equal(r.decision, "not_eligible"); assert.equal(r.status, "not_eligible");
});
t("B (Intermediate only) vs Master's scholarship -> not_eligible, with an actionable reason", () => {
  const r = ev(profile(edu({ level: "intermediate" })), sch());
  assert.equal(r.decision, "not_eligible");
  assert.match(r.checks.find((c) => c.key === "degree_level").detail, /Bachelor's/);
});
t("B: not_eligible is not hidden by a good field/GPA, and is never counted as eligible", () => {
  const s = run(profile(edu({ level: "master" })), [sch({ degreeLevel: "Bachelor" })], { showAll: true });
  assert.equal(s.counts.byDecision.eligible, 0); assert.equal(s.counts.byDecision.not_eligible, 1);
});

console.log("Student C — missing GPA");
t("C (no CGPA) vs scholarship with a minimum GPA -> needs_information, NOT eligible", () => {
  const r = ev(profile(edu({ cgpa: null, cgpaScale: null })), sch());
  assert.equal(r.decision, "needs_information"); assert.notEqual(r.status, "likely_eligible");
  assert.deepEqual(r.checks.find((c) => c.key === "gpa").missing, { section: "education", what: "CGPA and CGPA scale" });
  assert.deepEqual(M.explainResult(r).missing.map((m) => m.what), ["CGPA and CGPA scale"]);
});
t("C (CGPA without a scale) -> needs_information", () => {
  assert.equal(ev(profile(edu({ cgpaScale: null })), sch()).decision, "needs_information");
});
t("C: the same student is eligible once the scholarship states no minimum GPA (nothing missing)", () => {
  assert.equal(ev(profile(edu({ cgpa: null, cgpaScale: null })), sch({ minimumGpa: null, minimumGpaScale: null })).decision, "eligible");
});
t("C2 (no field recorded) vs field-restricted scholarship -> needs_information, NOT eligible", () => {
  const r = ev(profile(edu({ field: null })), sch({ minimumGpa: null, minimumGpaScale: null }));
  assert.equal(r.decision, "needs_information"); assert.notEqual(r.status, "likely_eligible");
});
t("C3 (no education at all) -> needs_information for every scholarship", () => {
  const r = ev({ nationality: null, education: [] }, sch());
  assert.equal(r.decision, "needs_information"); assert.equal(r.relevant, true);
});

console.log("Student D — no suitable scholarship");
t("D: every published scholarship is a different level or field -> no match is shown, hidden count is reported", () => {
  const cands = [sch({ id: "a", degreeLevel: "PhD", field: "Computer Science" }), sch({ id: "b", field: "Medicine" }), sch({ id: "c", degreeLevel: "Bachelor" })];
  const s = run(profile(edu({ level: "master", field: "Law", cgpa: 3.5 })), cands);
  assert.equal(s.results.length, 0); assert.equal(s.counts.shown, 0); assert.ok(s.counts.hiddenNotRelevant >= 2);
  assert.equal(s.counts.byDecision.eligible, 0);
});
t("D: an empty catalogue yields no matches and no error", () => {
  const s = run(profile(edu()), []); assert.equal(s.results.length, 0); assert.equal(s.counts.candidates, 0);
});

console.log("Unknown vs needs information (the two are never blended)");
t("scholarship level text we cannot map -> unknown (adding profile data cannot help)", () => {
  const r = ev(profile(edu()), sch({ degreeLevel: "Fellowship" }));
  assert.equal(r.decision, "unknown"); assert.equal(M.explainResult(r).missing.length, 0);
});
t("Bachelor's in progress vs Master's -> unknown (rule varies by provider), not eligible", () => {
  const r = ev(profile(edu({ expectedGraduation: "2027-06-30" })), sch());
  assert.equal(r.decision, "unknown");
});
t("Bachelor's with no graduation date -> needs_information (profile can fix it)", () => {
  assert.equal(ev(profile(edu({ expectedGraduation: null })), sch()).decision, "needs_information");
});
t("a required written requirement cannot be verified -> never eligible (unknown), optional one does not matter", () => {
  const req = (required) => [{ id: "r", requirementType: "other", title: "Letter of intent", description: null, required }];
  assert.equal(ev(profile(edu()), sch({ requirements: req(true) })).decision, "unknown");
  assert.equal(ev(profile(edu()), sch({ requirements: req(false) })).decision, "eligible");
});
t("a scholarship with nothing checkable is unknown, never eligible", () => {
  const r = ev(profile(edu()), sch({ degreeLevel: "Any level", field: null, minimumGpa: null, minimumGpaScale: null }));
  assert.equal(r.decision, "unknown");
});
t("wrong field: not eligible is NOT claimed (free text) but eligible is not either", () => {
  const r = ev(profile(edu()), sch({ field: "Medicine" }));
  assert.equal(r.decision, "unknown"); assert.equal(r.relevant, false);
});
t("GPA below the minimum -> not_eligible even if everything else is missing or unknown", () => {
  const r = ev(profile(edu({ cgpa: 2.0, field: null })), sch());
  assert.equal(r.decision, "not_eligible");
});

console.log("Invariant: missing information never becomes eligible (exhaustive grid)");
t("no combination of missing student data yields 'eligible' when a checked criterion is unresolved", () => {
  const levels = ["bachelor", "master", "intermediate", "other", null];
  const fields = ["Computer Science", null, "Law"];
  const cgpas = [[3.6, 4], [null, null], [3.6, null], [null, 4], [2.0, 4]];
  const grads = ["2024-06-30", null, "2030-06-30"];
  const sFields = ["Computer Science", null];
  const sGpas = [[3.0, 4], [null, null], [3.0, null]];
  const sLevels = ["Master", "Fellowship", "Any level"];
  for (const level of levels) for (const field of fields) for (const [cgpa, cgpaScale] of cgpas) for (const g of grads)
    for (const sf of sFields) for (const [mg, ms] of sGpas) for (const sl of sLevels) {
      const p = { nationality: null, education: [edu({ level, field, cgpa, cgpaScale, expectedGraduation: g })] };
      const s = sch({ degreeLevel: sl, field: sf, minimumGpa: mg, minimumGpaScale: ms });
      const r = ev(p, s);
      if (r.decision !== "eligible") continue;
      // Eligible requires every mandatory check to be a definite "met"/"not_applicable".
      for (const c of r.checks) if (c.mandatory) assert.ok(c.outcome === "met" || c.outcome === "not_applicable", JSON.stringify({ level, field, cgpa, cgpaScale, g, sf, mg, ms, sl, c: c.key + ":" + c.outcome }));
      assert.ok(r.metCount > 0);
    }
});

console.log("What the engine evaluates (honest product boundary)");
t("only degree level, GPA and field produce eligibility checks; nationality/IELTS/age/etc. never do", () => {
  const r = ev(profile(edu()), sch({ englishRequirementSummary: "IELTS 7", eligibilitySummary: "Age under 30, Pakistani nationals only, 2 years research" }));
  const keys = new Set(r.checks.filter((c) => c.outcome !== "info").map((c) => c.key));
  assert.deepEqual([...keys].sort(), ["degree_level", "field", "gpa"]);
  assert.ok(!r.checks.some((c) => /nationality|age|ielts|research|prefer/i.test(c.label)));
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
