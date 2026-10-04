// Unit tests for the pure Module 05 validators + completion logic. Compiled from TS by run-unit.sh.
const assert = require("node:assert/strict");
const path = require("node:path");
const dir = process.argv[2];
const { validateProfile, validateEducation, validateExperience, isUuid } = require(path.join(dir, "validation.js"));
const { computeCompletion } = require(path.join(dir, "completion.js"));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  PASS", name); } catch (e) { fail++; console.log("  FAIL", name, "-", e.message.split("\n")[0]); } };
const bad = (r, field) => { assert.equal(r.ok, false, "expected invalid"); assert.ok(r.errors[field], `expected error on ${field}, got ${JSON.stringify(r.errors)}`); };

console.log("profile");
t("valid profile; optional blanks become null", () => { const r = validateProfile({ full_name: " Ali Khan ", nationality: "", city: " Lahore" }); assert.deepEqual(r.data, { full_name: "Ali Khan", nationality: null, city: "Lahore" }); });
t("full name required", () => bad(validateProfile({ full_name: "  " }), "full_name"));
t("full name max 200", () => { assert.equal(validateProfile({ full_name: "x".repeat(200) }).ok, true); bad(validateProfile({ full_name: "x".repeat(201) }), "full_name"); });
t("nationality / city max 100", () => { bad(validateProfile({ full_name: "a", nationality: "x".repeat(101) }), "nationality"); bad(validateProfile({ full_name: "a", city: "x".repeat(101) }), "city"); });
t("control chars / newlines rejected", () => { bad(validateProfile({ full_name: "a\u0000b" }), "full_name"); bad(validateProfile({ full_name: "a\nb" }), "full_name"); });
t("non-string values ignored", () => bad(validateProfile({ full_name: { $ne: "" } }), "full_name"));
t("output never contains role / ids", () => { const r = validateProfile({ full_name: "a", role: "admin", user_id: "x", id: "y" }); assert.deepEqual(Object.keys(r.data).sort(), ["city", "full_name", "nationality"]); });

console.log("education");
const edu = (o = {}) => ({ level: "bachelor", institution: "NUST", ...o });
t("valid minimal", () => assert.equal(validateEducation(edu()).ok, true));
t("valid full", () => { const r = validateEducation(edu({ degree_name: "BSc", field: "CS", cgpa: "3.5", cgpa_scale: "4", start_date: "2019-09-01", expected_graduation: "2023-06-30" })); assert.equal(r.ok, true); assert.equal(r.data.cgpa, 3.5); assert.equal(r.data.cgpa_scale, 4); });
t("level required and allow-listed", () => { bad(validateEducation({ institution: "x" }), "level"); bad(validateEducation(edu({ level: "wizard" })), "level"); });
t("institution required", () => bad(validateEducation({ level: "bachelor" }), "institution"));
t("length limits", () => { bad(validateEducation(edu({ institution: "x".repeat(201) })), "institution"); bad(validateEducation(edu({ degree_name: "x".repeat(201) })), "degree_name"); bad(validateEducation(edu({ field: "x".repeat(201) })), "field"); });
t("cgpa must be plain decimal", () => { for (const v of ["abc", "1e3", "NaN", "Infinity", "-1", "3,5", "0x10", "3.555", " "]) { const r = validateEducation(edu({ cgpa: v, cgpa_scale: "4" })); if (v.trim()) bad(r, "cgpa"); } });
t("cgpa above scale rejected", () => bad(validateEducation(edu({ cgpa: "4.5", cgpa_scale: "4" })), "cgpa"));
t("cgpa without scale rejected", () => bad(validateEducation(edu({ cgpa: "3" })), "cgpa_scale"));
t("scale zero rejected", () => bad(validateEducation(edu({ cgpa_scale: "0" })), "cgpa_scale"));
t("numeric(4,2) overflow rejected before the DB", () => bad(validateEducation(edu({ cgpa: "100", cgpa_scale: "100" })), "cgpa"));
t("scale 100 (percentages) rejected with a clear message: column is numeric(4,2)", () => { const r = validateEducation(edu({ cgpa: "85", cgpa_scale: "100" })); bad(r, "cgpa_scale"); assert.match(r.errors.cgpa_scale, /not supported yet/); });
t("scale 99.99 accepted (max storable)", () => assert.equal(validateEducation(edu({ cgpa: "85", cgpa_scale: "99.99" })).ok, true));
t("bad / impossible dates rejected", () => { for (const d of ["2020-02-30", "2020-13-01", "01/02/2020", "2020-1-1", "abcd", "1800-01-01", "2200-01-01"]) bad(validateEducation(edu({ start_date: d })), "start_date"); });
t("leap day accepted", () => assert.equal(validateEducation(edu({ start_date: "2020-02-29" })).ok, true));
t("graduation before start rejected", () => bad(validateEducation(edu({ start_date: "2023-01-01", expected_graduation: "2022-01-01" })), "expected_graduation"));
t("sends only whitelisted keys", () => assert.deepEqual(Object.keys(validateEducation(edu({ profile_id: "x", id: "y" })).data).sort(), ["cgpa", "cgpa_scale", "degree_name", "expected_graduation", "field", "institution", "level", "start_date"]));

console.log("experience");
const exp = (o = {}) => ({ experience_type: "internship", title: "Intern", ...o });
t("valid minimal", () => assert.equal(validateExperience(exp()).ok, true));
t("type required and allow-listed", () => { bad(validateExperience({ title: "x" }), "experience_type"); bad(validateExperience(exp({ experience_type: "x" })), "experience_type"); });
t("title required, max 150", () => { bad(validateExperience({ experience_type: "work" }), "title"); bad(validateExperience(exp({ title: "x".repeat(151) })), "title"); });
t("organization max 200, description max 2000", () => { bad(validateExperience(exp({ organization: "x".repeat(201) })), "organization"); assert.equal(validateExperience(exp({ description: "x".repeat(2000) })).ok, true); bad(validateExperience(exp({ description: "x".repeat(2001) })), "description"); });
t("description keeps newlines", () => assert.equal(validateExperience(exp({ description: "a\nb" })).data.description, "a\nb"));
t("end before start rejected", () => bad(validateExperience(exp({ start_date: "2022-06-01", end_date: "2022-01-01" })), "end_date"));
t("ongoing (no end date) ok", () => assert.equal(validateExperience(exp({ start_date: "2022-06-01" })).data.end_date, null));
t("bad date rejected", () => bad(validateExperience(exp({ end_date: "2022-02-31" })), "end_date"));

console.log("ids");
t("uuid check", () => { assert.equal(isUuid("0b1f8f4e-1c3a-4e0e-9a55-3f6e2d9c7b11"), true); for (const v of ["", "1", "abc", "0b1f8f4e1c3a4e0e9a553f6e2d9c7b11", null, undefined, "' or 1=1 --"]) assert.equal(isUuid(v), false); });

console.log("completion");
const P = { id: "p", full_name: "A", nationality: "PK", city: "L" };
t("empty profile 0%", () => assert.equal(computeCompletion({ id: "p", full_name: null, nationality: null, city: null }, [], []).percent, 0));
t("personal only = 60%", () => assert.equal(computeCompletion(P, [], []).percent, 60));
t("education without cgpa = 80%", () => assert.equal(computeCompletion(P, [{ id: "e", cgpa: null, cgpa_scale: null }], []).percent, 80));
t("with cgpa = 100% and complete; experience optional", () => { const c = computeCompletion(P, [{ id: "e", cgpa: 3, cgpa_scale: 4 }], []); assert.equal(c.percent, 100); assert.equal(c.complete, true); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
