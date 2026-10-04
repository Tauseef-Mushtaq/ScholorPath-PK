// Unit tests for the Module 09 eligibility + matching engine (pure functions; plain objects; no database).
const assert = require("node:assert/strict");
const path = require("node:path");
const dir = process.argv[2];
const M = require(path.join(dir, "index.js"));
const N = require(path.join(dir, "normalize.js"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", String(e.message).split("\n")[0]); } };
const TODAY = "2026-10-01";

const edu = (o = {}) => ({ level: "bachelor", field: "Computer Science", cgpa: 3.6, cgpaScale: 4, startDate: "2020-09-01", expectedGraduation: "2024-06-30", ...o });
const prof = (...e) => ({ nationality: "Pakistani", education: e.length ? e : [edu()] });
const sch = (o = {}) => ({
  id: "s-" + Math.random().toString(36).slice(2, 8), name: "Test Scholarship", provider: "Provider", status: "active",
  degreeLevel: "Master's", field: "Computer Science", fundingType: "fully_funded", deadline: "2027-03-01",
  country: { name: "Testland", slug: "testland" }, university: null, minimumGpa: null, minimumGpaScale: null,
  englishRequirementSummary: null, eligibilitySummary: null, requirements: [], ...o,
});
const ev = (p, s) => M.evaluateScholarship(p, s, TODAY);
const check = (r, key) => r.checks.find((c) => c.key === key);

console.log("Eligibility — statuses");
t("all known mandatory requirements satisfied -> likely_eligible", () => {
  const r = ev(prof(), sch({ minimumGpa: 3.0, minimumGpaScale: 4 }));
  assert.equal(r.status, "likely_eligible");
  assert.equal(check(r, "degree_level").outcome, "met"); assert.equal(check(r, "gpa").outcome, "met"); assert.equal(check(r, "field").outcome, "met");
  assert.equal(r.metCount, 3);
});
t("a mandatory requirement is not satisfied (GPA) -> not_eligible", () => {
  const r = ev(prof(edu({ cgpa: 2.5 })), sch({ minimumGpa: 3.0, minimumGpaScale: 4 }));
  assert.equal(r.status, "not_eligible"); assert.equal(check(r, "gpa").outcome, "not_met");
  assert.match(check(r, "gpa").detail, /below the minimum/);
});
t("some requirements unknown (no CGPA) -> possibly_eligible, with a pointer to the profile", () => {
  const r = ev(prof(edu({ cgpa: null, cgpaScale: null })), sch({ minimumGpa: 3.0, minimumGpaScale: 4 }));
  assert.equal(r.status, "possibly_eligible"); assert.equal(check(r, "gpa").outcome, "unknown");
  assert.deepEqual(check(r, "gpa").missing, { section: "education", what: "CGPA and CGPA scale" });
});
t("scholarship with incomplete requirements (no field, no GPA, no rows) is NOT a mismatch", () => {
  const r = ev(prof(), sch({ field: null }));
  assert.equal(r.status, "likely_eligible"); assert.equal(check(r, "gpa").outcome, "not_applicable"); assert.equal(check(r, "field").outcome, "not_applicable"); assert.equal(r.relevant, true);
});
t("unrecognised degree level text -> unknown, never a mismatch", () => {
  const r = ev(prof(), sch({ degreeLevel: "Fellowship", field: null }));
  assert.equal(check(r, "degree_level").outcome, "unknown"); assert.equal(r.status, "insufficient_information"); assert.equal(r.relevant, true);
});
t("student profile incomplete (no education) -> insufficient_information + missing education", () => {
  const r = ev({ nationality: null, education: [] }, sch());
  assert.equal(r.status, "insufficient_information"); assert.equal(check(r, "degree_level").missing.section, "education");
  assert.equal(r.relevant, true, "missing info never hides a scholarship as irrelevant");
});
t("education with only the 'other' level is treated as no usable education", () => {
  assert.equal(ev({ nationality: null, education: [edu({ level: "other" })] }, sch()).status, "insufficient_information");
});
t("optional requirement missing/unknown does not lower the status", () => {
  const r = ev(prof(), sch({ requirements: [{ id: "r1", requirementType: "x", title: "Optional essay", description: null, required: false }] }));
  assert.equal(r.status, "likely_eligible"); assert.equal(r.checks.filter((c) => c.key === "requirement")[0].outcome, "unknown");
});
t("required requirement row cannot be auto-verified -> possibly_eligible, never likely", () => {
  const r = ev(prof(), sch({ requirements: [{ id: "r1", requirementType: "x", title: "Two reference letters", description: "From professors", required: true }] }));
  assert.equal(r.status, "possibly_eligible"); assert.match(r.checks.find((c) => c.key === "requirement").detail, /cannot be checked automatically/);
});
t("Pakistan-side process rows are guidance, not eligibility: no check, no status change (ADR-032)", () => {
  const rows = [
    { id: "p1", requirementType: "pakistan_side", title: "Attest your degree", description: "x", required: true },
    { id: "p2", requirementType: " Pakistan-Side ", title: "Another step", description: null, required: true },
  ];
  const r = ev(prof(), sch({ requirements: rows }));
  assert.equal(r.status, "likely_eligible");
  assert.equal(r.checks.filter((c) => c.key === "requirement").length, 0);
  // control: an ordinary required row is still an unverifiable mandatory check
  const c = ev(prof(), sch({ requirements: [...rows, { id: "q", requirementType: "documents", title: "Transcript", description: null, required: true }] }));
  assert.equal(c.status, "possibly_eligible");
  assert.equal(c.checks.filter((k) => k.key === "requirement").length, 1);
});
t("English / eligibility summaries are information only (never change status)", () => {
  const r = ev(prof(), sch({ englishRequirementSummary: "IELTS 6.5", eligibilitySummary: "Open to all nationalities" }));
  assert.equal(r.status, "likely_eligible"); assert.deepEqual(r.checks.filter((c) => c.outcome === "info").map((c) => c.key), ["english", "eligibility_summary"]);
});
t("nationality is NOT evaluated and cannot change a result", () => {
  const s = sch({ minimumGpa: 3, minimumGpaScale: 4 });
  const a = ev({ ...prof(), nationality: "Pakistani" }, s), b = ev({ ...prof(), nationality: null }, s), c = ev({ ...prof(), nationality: "Atlantis" }, s);
  assert.deepEqual(a.checks, b.checks); assert.deepEqual(a.checks, c.checks); assert.ok(!a.checks.some((x) => /nationality/i.test(x.label)));
});
t("invalid / unexpected data is handled safely (no throw, valid status)", () => {
  const bad = [
    [prof(edu({ cgpa: NaN, cgpaScale: 0 })), sch({ minimumGpa: 3, minimumGpaScale: 4 })],
    [prof(edu({ cgpa: 5, cgpaScale: 4 })), sch({ minimumGpa: 3, minimumGpaScale: 4 })],
    [prof(edu({ cgpa: -1 })), sch({ minimumGpa: 3, minimumGpaScale: 0 })],
    [prof(edu({ level: "wizard" })), sch({ degreeLevel: "" })],
    [prof(edu({ startDate: "not-a-date", expectedGraduation: "2024-13-45" })), sch({ deadline: "soon" })],
    [{ nationality: 5, education: null }, sch({ requirements: null })],
    [{ education: [null, undefined, {}] }, sch({ field: undefined, degreeLevel: null, minimumGpa: "3" })],
    [prof(), sch({ requirements: [null, { title: "" }, { title: 5 }, { title: "ok" }] })],
    [prof(), sch({ minimumGpa: Infinity, minimumGpaScale: -4, field: "!!!", degreeLevel: "💥" })],
  ];
  const valid = ["likely_eligible", "possibly_eligible", "not_eligible", "insufficient_information"];
  for (const [p, s] of bad) { const r = ev(p, s); assert.ok(valid.includes(r.status)); assert.ok(["open", "closed", "unknown"].includes(r.availability)); }
});

console.log("Eligibility — degree level rules");
t("completed Bachelor's -> Master's met", () => assert.equal(check(ev(prof(), sch()), "degree_level").outcome, "met"));
t("Bachelor's in progress -> Master's unknown (final-year rule varies)", () => {
  const r = ev(prof(edu({ expectedGraduation: "2027-06-30" })), sch()); assert.equal(check(r, "degree_level").outcome, "unknown"); assert.equal(r.status, "possibly_eligible");
});
t("Bachelor's without graduation date -> unknown + asks for the date", () => {
  const r = ev(prof(edu({ expectedGraduation: null })), sch()); assert.equal(check(r, "degree_level").outcome, "unknown"); assert.match(check(r, "degree_level").missing.what, /Graduation date/);
});
t("already holds the same/higher level -> not_met and not relevant", () => {
  const r = ev(prof(edu({ level: "master" })), sch()); assert.equal(check(r, "degree_level").outcome, "not_met"); assert.equal(r.status, "not_eligible"); assert.equal(r.relevant, false);
  assert.equal(ev(prof(edu({ level: "phd" })), sch({ degreeLevel: "Bachelor's" })).status, "not_eligible");
});
t("Master's -> PhD met; Bachelor's only -> PhD unknown (some accept it)", () => {
  assert.equal(check(ev(prof(edu({ level: "master" })), sch({ degreeLevel: "PhD" })), "degree_level").outcome, "met");
  assert.equal(check(ev(prof(), sch({ degreeLevel: "PhD" })), "degree_level").outcome, "unknown");
});
t("Intermediate only -> Master's not_met (needs Bachelor's), says to add it if held", () => {
  const r = ev(prof(edu({ level: "intermediate" })), sch()); assert.equal(check(r, "degree_level").outcome, "not_met"); assert.match(check(r, "degree_level").detail, /add it to your education/);
});
t("intermediate completed -> Bachelor's met; Matric only -> Bachelor's not_met", () => {
  assert.equal(check(ev(prof(edu({ level: "intermediate" })), sch({ degreeLevel: "Undergraduate" })), "degree_level").outcome, "met");
  assert.equal(check(ev(prof(edu({ level: "high_school" })), sch({ degreeLevel: "Bachelor" })), "degree_level").outcome, "not_met");
});
t("multi-level text ('Master's and PhD') uses the most favourable level", () => {
  assert.equal(check(ev(prof(), sch({ degreeLevel: "Master's and PhD" })), "degree_level").outcome, "met");
});
t("'any level' scholarship has no level restriction", () => {
  const r = ev(prof(edu({ level: "phd" })), sch({ degreeLevel: "All levels" })); assert.equal(check(r, "degree_level").outcome, "not_applicable"); assert.equal(r.relevant, true);
});
t("degree text parser: synonyms and unknowns", () => {
  const p = (x) => N.parseScholarshipLevels(x);
  assert.deepEqual(p("MSc / MPhil").levels, ["master"]); assert.deepEqual(p("Postgraduate").levels, ["master"]); assert.deepEqual(p("Ph.D.").levels, ["phd"]);
  assert.deepEqual(p("Doctoral").levels, ["phd"]); assert.deepEqual(p("Undergraduate (BS)").levels, ["bachelor"]); assert.deepEqual(p("Bachelor's, Master's").levels, ["bachelor", "master"]);
  assert.equal(p("Fellowship").kind, "unrecognized"); assert.equal(p(null).kind, "unrecognized"); assert.equal(p("").kind, "unrecognized"); assert.equal(p("Any").kind, "any");
});

console.log("Eligibility — GPA rules");
t("same scale: equal passes, below fails", () => {
  assert.equal(check(ev(prof(edu({ cgpa: 3.0 })), sch({ minimumGpa: 3.0, minimumGpaScale: 4 })), "gpa").outcome, "met");
  assert.equal(check(ev(prof(edu({ cgpa: 2.99 })), sch({ minimumGpa: 3.0, minimumGpaScale: 4 })), "gpa").outcome, "not_met");
});
t("different scales: converted proportionally, flagged approximate", () => {
  const r = ev(prof(edu({ cgpa: 3.5 })), sch({ minimumGpa: 8, minimumGpaScale: 10 })); assert.equal(check(r, "gpa").outcome, "met"); assert.match(check(r, "gpa").detail, /approximation/);
});
t("different scales: small shortfall is 'unknown', large shortfall is 'not_met'", () => {
  assert.equal(check(ev(prof(edu({ cgpa: 3.3 })), sch({ minimumGpa: 8.5, minimumGpaScale: 10 })), "gpa").outcome, "unknown");
  assert.equal(check(ev(prof(edu({ cgpa: 3.0 })), sch({ minimumGpa: 8.5, minimumGpaScale: 10 })), "gpa").outcome, "not_met");
});
t("scholarship GPA without a scale -> unknown", () => assert.equal(check(ev(prof(), sch({ minimumGpa: 3 })), "gpa").outcome, "unknown"));
t("CGPA recorded without scale -> unknown + asks for CGPA/scale", () => {
  const r = ev(prof(edu({ cgpaScale: null })), sch({ minimumGpa: 3, minimumGpaScale: 4 })); assert.equal(check(r, "gpa").outcome, "unknown"); assert.ok(check(r, "gpa").missing);
});
t("GPA record is chosen for the target level (Bachelor's CGPA for a Master's, not the Master's in progress)", () => {
  const p = prof(edu({ cgpa: 3.9 }), edu({ level: "master", cgpa: 2.0, expectedGraduation: "2027-06-30" }));
  assert.equal(check(ev(p, sch({ degreeLevel: "PhD", minimumGpa: 3.5, minimumGpaScale: 4 })), "gpa").outcome, "not_met", "PhD: uses the Master's record");
  const p2 = prof(edu({ cgpa: 3.9 }), edu({ level: "intermediate", cgpa: 1.0 }));
  assert.equal(check(ev(p2, sch({ minimumGpa: 3.5, minimumGpaScale: 4 })), "gpa").outcome, "met", "Master's: uses the Bachelor's record");
});

console.log("Eligibility — field (relevance only)");
t("overlapping words -> met; stem-like words -> met", () => {
  assert.equal(check(ev(prof(edu({ field: "Computer Engineering" })), sch({ field: "Computer Science" })), "field").outcome, "met");
  assert.equal(check(ev(prof(edu({ field: "Electrical Engineer" })), sch({ field: "Engineering" })), "field").outcome, "met");
});
t("unrelated field -> not_met, marked not relevant, NEVER eligible and NEVER 'not eligible' (Repair Session 3)", () => {
  // Before Repair Session 3 this asserted status === "likely_eligible": a wrong-field scholarship was labelled
  // "Likely eligible" while the same card listed "Does not match your profile". A word mismatch cannot prove
  // ineligibility (free text), but it must not read as eligible either.
  const r = ev(prof(), sch({ field: "Medicine" })); assert.equal(check(r, "field").outcome, "not_met"); assert.equal(r.relevant, false);
  assert.equal(r.status, "possibly_eligible"); assert.equal(r.decision, "unknown");
});
t("'any field' wording and empty field = unrestricted", () => {
  for (const f of ["Any field", "All fields", "ALL", "Open", "Multidisciplinary", "", null, undefined]) assert.equal(check(ev(prof(), sch({ field: f })), "field").outcome, "not_applicable", String(f));
});
t("student without a field -> unknown (not mismatch) + missing hint", () => {
  const r = ev(prof(edu({ field: null })), sch()); assert.equal(check(r, "field").outcome, "unknown"); assert.equal(r.relevant, true); assert.ok(check(r, "field").missing);
  // Missing information must never become eligible (Repair Session 3).
  assert.notEqual(r.status, "likely_eligible"); assert.equal(r.decision, "needs_information");
});
t("field comes from the latest education, not older records", () => {
  const p = prof(edu({ level: "intermediate", field: "Medicine" }), edu({ field: "Computer Science" }));
  assert.equal(check(ev(p, sch({ field: "Medicine" })), "field").outcome, "not_met");
});
t("short tokens do not create false matches ('art' vs 'artificial')", () => assert.equal(N.fieldsOverlap("Artificial Intelligence", ["Art History"]), false));

console.log("Matching — selection, visibility, availability");
const A = prof();
const run = (cands, opts = {}) => M.buildMatches(A, cands, TODAY, { includeClosed: false, showAll: false, ...opts });
t("a relevant scholarship is matched", () => { const s = sch({ id: "rel" }); const out = run([s]); assert.equal(out.results.length, 1); assert.equal(out.results[0].scholarship.id, "rel"); });
t("an unrelated scholarship is not matched by default, but is counted and available with showAll", () => {
  const out = run([sch({ id: "rel" }), sch({ id: "med", field: "Medicine" })]); assert.deepEqual(out.results.map((r) => r.scholarship.id), ["rel"]); assert.equal(out.counts.hiddenNotRelevant, 1);
  assert.equal(run([sch({ id: "rel" }), sch({ id: "med", field: "Medicine" })], { showAll: true }).results.length, 2);
});
t("scholarship for a different degree level is not matched", () => assert.equal(run([sch({ degreeLevel: "Bachelor's" }), sch({ degreeLevel: "PhD", id: "p" })]).results.map((r) => r.scholarship.id).join(), "p"));
t("draft scholarships are excluded (even with showAll/includeClosed)", () => {
  const out = run([sch({ id: "d", status: "draft" })], { showAll: true, includeClosed: true }); assert.equal(out.results.length, 0); assert.equal(out.counts.excludedNotPublic, 1);
});
t("archived scholarships are excluded", () => assert.equal(run([sch({ id: "a", status: "archived" })], { showAll: true, includeClosed: true }).results.length, 0));
t("unknown / missing status is excluded (fail closed)", () => assert.equal(run([sch({ status: "published" }), sch({ status: undefined }), sch({ status: null })], { showAll: true }).results.length, 0));
t("expired scholarship hidden by default; shown last when includeClosed; labelled closed", () => {
  const open = sch({ id: "open", deadline: "2027-01-01" }), closed = sch({ id: "closed", deadline: "2026-09-30" });
  let out = run([closed, open]); assert.deepEqual(out.results.map((r) => r.scholarship.id), ["open"]); assert.equal(out.counts.hiddenClosed, 1);
  out = run([closed, open], { includeClosed: true }); assert.deepEqual(out.results.map((r) => r.scholarship.id), ["open", "closed"]); assert.equal(out.results[1].availability, "closed");
});
t("deadline today is still open; yesterday is closed", () => { assert.equal(M.availabilityOf("2026-10-01", TODAY), "open"); assert.equal(M.availabilityOf("2026-09-30", TODAY), "closed"); });
t("missing / malformed deadlines do not crash and are 'unknown'", () => {
  for (const d of [null, undefined, "", "garbage", "2026-02-31"]) assert.equal(M.availabilityOf(d, TODAY), "unknown", String(d));
  const out = run([sch({ id: "n1", deadline: null }), sch({ id: "n2", deadline: "garbage" })]); assert.equal(out.results.length, 2);
});
t("multiple matching scholarships are all returned and counted by status", () => {
  const out = run([sch({ id: "1" }), sch({ id: "2", minimumGpa: 3.9, minimumGpaScale: 4 }), sch({ id: "3", requirements: [{ id: "r", requirementType: "x", title: "Letter", description: null, required: true }] })]);
  assert.equal(out.results.length, 3); assert.deepEqual(out.counts.byStatus, { likely_eligible: 1, possibly_eligible: 1, not_eligible: 1, insufficient_information: 0 });
});
t("empty candidate list and malformed candidates are handled", () => {
  assert.equal(run([]).results.length, 0); assert.equal(run([]).counts.candidates, 0);
  const out = run([null, undefined, {}, sch({ id: "ok" })]); assert.equal(out.results.length, 1);
});

console.log("Matching — sorting");
t("order: tier, open before closed, more checks met, nearest deadline, no-deadline last, name, id", () => {
  const cands = [
    sch({ id: "z-none", name: "Same", deadline: null }), sch({ id: "b", name: "Same", deadline: "2027-02-01" }),
    sch({ id: "a", name: "Same", deadline: "2027-02-01" }), sch({ id: "soon", name: "Soon", deadline: "2026-11-01" }),
    sch({ id: "named-a", name: "Aaa", deadline: "2027-02-01" }), sch({ id: "poss", name: "Possible", deadline: "2026-10-05", requirements: [{ id: "r", requirementType: "x", title: "L", description: null, required: true }] }),
    sch({ id: "notel", name: "NotEl", deadline: "2026-10-02", minimumGpa: 3.99, minimumGpaScale: 4 }),
  ];
  const ids = run(cands).results.map((r) => r.scholarship.id);
  assert.deepEqual(ids, ["soon", "named-a", "a", "b", "z-none", "poss", "notel"]);
});
t("more matched checks rank higher within the same tier", () => {
  const a = sch({ id: "plain", field: null, deadline: "2026-12-01" }), b = sch({ id: "gpa", minimumGpa: 3, minimumGpaScale: 4, deadline: "2027-06-01" });
  assert.deepEqual(run([a, b]).results.map((r) => r.scholarship.id), ["gpa", "plain"]);
});
t("sorting is deterministic regardless of input order", () => {
  const cands = Array.from({ length: 25 }, (_, i) => sch({ id: "id" + String(i).padStart(2, "0"), name: "N" + (i % 4), deadline: i % 5 ? "2027-0" + (1 + (i % 9)) + "-10" : null }));
  const base = run(cands).results.map((r) => r.scholarship.id).join();
  for (let k = 0; k < 5; k++) { const sh = cands.slice().sort(() => Math.random() - 0.5); assert.equal(run(sh).results.map((r) => r.scholarship.id).join(), base); }
});

console.log("Explanations and profile gaps");
t("status labels match the product wording and descriptions never promise eligibility", () => {
  assert.deepEqual(Object.values(M.STATUS_LABEL), ["Likely eligible", "Possibly eligible", "Not eligible", "Insufficient information"]);
  for (const d of Object.values(M.STATUS_DESCRIPTION)) assert.ok(!/guarantee|will be (selected|awarded)|probability|chance/i.test(d));
});
t("explanation groups checks, counts plainly, and de-duplicates missing items", () => {
  const r = ev(prof(edu({ cgpa: null, cgpaScale: null, field: null })), sch({ minimumGpa: 3, minimumGpaScale: 4 }));
  const x = M.explainResult(r);
  assert.ok(x.toConfirm.length >= 2); assert.ok(x.missing.length >= 2); assert.equal(new Set(x.missing.map((m) => m.what)).size, x.missing.length);
  assert.ok(x.missing.every((m) => m.href.startsWith("/profile"))); assert.match(x.summary, /^\d+ of \d+ checks? matched your profile\.$/);
});
t("assessProfile: empty / partial / ready", () => {
  assert.equal(M.assessProfile({ nationality: null, education: [] }).readiness, "empty");
  assert.equal(M.assessProfile({ nationality: null, education: [edu({ level: "other" })] }).readiness, "empty");
  const partial = M.assessProfile(prof(edu({ field: null, cgpa: null, expectedGraduation: null })));
  assert.equal(partial.readiness, "partial"); assert.equal(partial.gaps.length, 3); assert.ok(partial.gaps.every((g) => g.why && g.href));
  assert.equal(M.assessProfile(prof()).readiness, "ready");
});
t("profile gaps list only data the engine uses (nationality/city are not requested)", () => {
  const a = M.assessProfile({ nationality: null, education: [edu({ field: null })] });
  assert.ok(a.gaps.every((g) => !/nationality|city/i.test(g.what)));
});

console.log("URL parameters");
t("parseMatchParams: whitelist only, clamps page, ignores identity params", () => {
  const p = M.parseMatchParams({ show: "all", closed: "1", page: "3", user_id: "x", profile_id: "y" });
  assert.deepEqual(p, { showAll: true, includeClosed: true, page: 3 });
  assert.deepEqual(M.parseMatchParams({ show: "yes", closed: "true", page: "-5" }), { showAll: false, includeClosed: false, page: 1 });
  assert.equal(M.parseMatchParams({ page: "99999" }).page, 200); assert.equal(M.parseMatchParams({ page: "abc" }).page, 1); assert.equal(M.parseMatchParams({ page: ["2", "3"] }).page, 2);
});
t("matchesHref round-trips and never contains identity params", () => {
  assert.equal(M.matchesHref({ showAll: false, includeClosed: false, page: 1 }), "/matches");
  const href = M.matchesHref({ showAll: true, includeClosed: true, page: 2 }); assert.equal(href, "/matches?show=all&closed=1&page=2");
  assert.deepEqual(M.parseMatchParams(Object.fromEntries(new URL("http://x" + href).searchParams)), { showAll: true, includeClosed: true, page: 2 });
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
