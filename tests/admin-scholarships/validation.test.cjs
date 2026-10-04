// Unit tests for Module 07 validators + import parser (pure; no DB).
const assert = require("node:assert/strict");
const path = require("node:path");
const dir = process.argv[2];
const V = require(path.join(dir, "validation.js"));
const { parseImportJson } = require(path.join(dir, "import.js"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message.split("\n")[0]); } };
const bad = (r, f) => { assert.equal(r.ok, false); assert.ok(r.errors[f], `expected error on ${f}, got ${JSON.stringify(r.errors)}`); };
const UUID = "123e4567-e89b-12d3-a456-426614174000";
const base = (o = {}) => ({ name: "Example Award", provider: "Example Body", country_id: UUID, degree_level: "Master", funding_type: "fully_funded", ...o });

console.log("scholarship");
t("valid minimal", () => { const r = V.validateScholarship(base()); assert.equal(r.ok, true); assert.equal(r.data.university_id, null); assert.equal(r.data.deadline, null); });
t("valid full", () => assert.equal(V.validateScholarship(base({ university_id: UUID, field: "CS", minimum_gpa: "3.2", minimum_gpa_scale: "4", application_fee: "25.50", opening_date: "2027-01-01", deadline: "2027-02-01", official_information_url: "https://a.example/x", official_application_url: "http://b.example" })).ok, true));
for (const f of ["name", "provider", "country_id", "degree_level", "funding_type"]) t(`missing ${f}`, () => bad(V.validateScholarship(base({ [f]: "" })), f));
t("invalid country uuid", () => bad(V.validateScholarship(base({ country_id: "nope" })), "country_id"));
t("invalid university uuid", () => bad(V.validateScholarship(base({ university_id: "1; drop table" })), "university_id"));
t("invalid funding type", () => bad(V.validateScholarship(base({ funding_type: "free" })), "funding_type"));
t("impossible / malformed dates", () => { bad(V.validateScholarship(base({ deadline: "2027-02-30" })), "deadline"); bad(V.validateScholarship(base({ opening_date: "01/02/2027" })), "opening_date"); });
t("deadline before opening", () => bad(V.validateScholarship(base({ opening_date: "2027-03-01", deadline: "2027-02-01" })), "deadline"));
t("deadline equal to opening ok", () => assert.equal(V.validateScholarship(base({ opening_date: "2027-03-01", deadline: "2027-03-01" })).ok, true));
t("numeric junk rejected", () => { for (const x of ["abc", "1e3", "NaN", "Infinity", "-1", "3,5", "0x10", "3.555"]) bad(V.validateScholarship(base({ application_fee: x })), "application_fee"); });
t("gpa needs scale; gpa <= scale; scale > 0", () => { bad(V.validateScholarship(base({ minimum_gpa: "3" })), "minimum_gpa_scale"); bad(V.validateScholarship(base({ minimum_gpa: "5", minimum_gpa_scale: "4" })), "minimum_gpa"); bad(V.validateScholarship(base({ minimum_gpa_scale: "0" })), "minimum_gpa_scale"); });
t("gpa above numeric(4,2)", () => bad(V.validateScholarship(base({ minimum_gpa_scale: "100" })), "minimum_gpa_scale"));
t("url must be http(s)", () => { for (const u of ["javascript:alert(1)", "ftp://x.example", "data:text/html,x", "example.com", "https://a b.example", "//x.example"]) bad(V.validateScholarship(base({ official_information_url: u })), "official_information_url"); });
t("length limits", () => { bad(V.validateScholarship(base({ name: "x".repeat(301) })), "name"); bad(V.validateScholarship(base({ eligibility_summary: "x".repeat(4001) })), "eligibility_summary"); });
t("control chars rejected", () => bad(V.validateScholarship(base({ name: "a\u0000b" })), "name"));
t("non-string values ignored", () => bad(V.validateScholarship(base({ name: { $ne: "" } })), "name"));
t("forged fields never in output", () => { const r = V.validateScholarship(base({ role: "admin", status: "active", id: UUID, last_verified_at: "2020-01-01", created_at: "x", user_id: UUID })); assert.equal(r.ok, true); const keys = Object.keys(r.data); for (const k of ["role", "status", "id", "last_verified_at", "created_at", "user_id"]) assert.ok(!keys.includes(k), k); for (const k of keys) assert.ok(V.SCHOLARSHIP_WRITABLE_COLUMNS.includes(k), k); assert.equal(keys.length, V.SCHOLARSHIP_WRITABLE_COLUMNS.length); });
t("FormData input works", () => { const fd = new FormData(); for (const [k, v] of Object.entries(base())) fd.set(k, v); assert.equal(V.validateScholarship(fd).ok, true); });
t("values preserved on failure", () => { const r = V.validateScholarship(base({ name: "Keep me", provider: "" })); assert.equal(r.ok, false); assert.equal(r.values.name, "Keep me"); });

console.log("status");
t("only draft|active|archived", () => { assert.equal(V.isStatus("active"), true); for (const s of ["published", "ACTIVE", "", null, undefined, 1]) assert.equal(V.isStatus(s), false); });
t("transitions: archived cannot publish directly", () => { assert.equal(V.canTransition("draft", "active"), true); assert.equal(V.canTransition("archived", "active"), false); assert.equal(V.canTransition("active", "active"), false); assert.equal(V.canTransition("active", "archived"), true); });
t("uuid check", () => { assert.equal(V.isUuid(UUID), true); for (const x of ["", "123", UUID + "x", "' or 1=1 --", null]) assert.equal(V.isUuid(x), false); });

console.log("source");
t("valid source", () => { const r = V.validateSource({ source_url: "https://x.example", priority: "1", active: "on" }); assert.equal(r.ok, true); assert.equal(r.data.active, true); assert.equal(r.data.priority, 1); });
t("source url required / http(s)", () => { bad(V.validateSource({}), "source_url"); bad(V.validateSource({ source_url: "javascript:1" }), "source_url"); });
t("priority whole number", () => { bad(V.validateSource({ source_url: "https://x.example", priority: "-1" }), "priority"); bad(V.validateSource({ source_url: "https://x.example", priority: "1.5" }), "priority"); bad(V.validateSource({ source_url: "https://x.example", priority: "99999" }), "priority"); });
t("source output excludes forged keys", () => { const r = V.validateSource({ source_url: "https://x.example", scholarship_id: UUID, content_hash: "x", last_verified_at: "x" }); assert.deepEqual(Object.keys(r.data).sort(), ["active", "priority", "source_name", "source_type", "source_url"]); });

console.log("list filters");
t("filters sanitised", () => { const f = V.parseAdminListFilters({ q: "a,b(c)%\u0001", status: "bogus", page: "-5" }); assert.equal(f.status, undefined); assert.equal(f.page, 1); assert.ok(!/[,()%]/.test(f.q)); assert.equal(V.parseAdminListFilters({ status: "draft", page: "3" }).page, 3); });

console.log("import parser");
const rec = (o = {}) => ({ country_slug: "germany", name: "A", provider: "B", degree_level: "Master", funding_type: "fully_funded", ...o });
t("valid import", () => { const r = parseImportJson(JSON.stringify([rec()])); assert.equal(r.ok, true); assert.equal(r.records[0].countrySlug, "germany"); });
t("rejects non-JSON / non-array / empty", () => { for (const x of ["", "{", "{}", "[]", "null"]) assert.equal(parseImportJson(x).ok, false); });
t("rejects status / id / unknown fields", () => { for (const k of ["status", "id", "last_verified_at", "role", "country_id"]) assert.equal(parseImportJson(JSON.stringify([rec({ [k]: "x" })])).ok, false, k); });
t("requires valid country_slug", () => { assert.equal(parseImportJson(JSON.stringify([rec({ country_slug: "" })])).ok, false); assert.equal(parseImportJson(JSON.stringify([rec({ country_slug: "Bad Slug" })])).ok, false); });
t("record count and size caps", () => { assert.equal(parseImportJson(JSON.stringify(Array(51).fill(rec()))).ok, false); assert.equal(parseImportJson("[" + "x".repeat(200001) + "]").ok, false); });
t("nested values rejected", () => assert.equal(parseImportJson(JSON.stringify([rec({ name: { a: 1 } })])).ok, false));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
