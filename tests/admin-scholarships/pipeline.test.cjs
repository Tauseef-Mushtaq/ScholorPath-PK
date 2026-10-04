// Import/publish pipeline tests (pure + static; no DB). Run via run-unit.sh with compiled dir.
const assert = require("node:assert/strict"); const path = require("node:path"); const fs = require("node:fs");
const dir = process.argv[2];
const { parseImportJson } = require(path.join(dir, "import.js"));
const { publishBlockers } = require(path.join(dir, "readiness.js"));
const actions = fs.readFileSync(path.resolve(__dirname, "../../src/lib/admin-scholarships/actions.ts"), "utf8");
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message.split("\n")[0]); } };
const rec = (o = {}) => ({ country_slug: "c-one", name: "A", provider: "B", degree_level: "Master", funding_type: "fully_funded", ...o });
const src = (o = {}) => ({ source_url: "https://official.example/x", source_name: "Official", ...o });
const sch = (o = {}) => ({ name: "A", provider: "B", country_id: "x", degree_level: "Master", funding_type: "fully_funded", official_information_url: "https://o.example", official_application_url: null, last_verified_at: "2026-01-01T00:00:00Z", ...o });
const vs = (o = {}) => ({ source_url: "https://o.example", active: true, last_verified_at: "2026-01-01T00:00:00Z", ...o });

console.log("import: valid / sources");
t("valid record with sources parses", () => { const r = parseImportJson(JSON.stringify([rec({ sources: [src()] })])); assert.equal(r.ok, true); assert.equal(r.records[0].sources.length, 1); assert.equal(r.records[0].sources[0].active, true); });
t("record without sources parses", () => assert.equal(parseImportJson(JSON.stringify([rec()])).records[0].sources.length, 0));
t("invalid source url rejected", () => { for (const u of ["javascript:alert(1)", "ftp://x.example", "example.com", ""]) assert.equal(parseImportJson(JSON.stringify([rec({ sources: [src({ source_url: u })] })])).ok, false, u); });
t("source cannot carry last_verified_at / scholarship_id / active", () => { for (const k of ["last_verified_at", "scholarship_id", "active", "id"]) assert.equal(parseImportJson(JSON.stringify([rec({ sources: [src({ [k]: "x" })] })])).ok, false, k); });
t("sources must be array, capped", () => { assert.equal(parseImportJson(JSON.stringify([rec({ sources: "x" })])).ok, false); assert.equal(parseImportJson(JSON.stringify([rec({ sources: Array(6).fill(src()) })])).ok, false); });
t("status cannot be smuggled via import", () => assert.equal(parseImportJson(JSON.stringify([rec({ status: "active" })])).ok, false));
t("last_verified_at cannot be smuggled via import", () => assert.equal(parseImportJson(JSON.stringify([rec({ last_verified_at: "2026-01-01" })])).ok, false));

console.log("publish gate");
t("fully ready passes", () => assert.deepEqual(publishBlockers(sch(), [vs()]), []));
t("no sources blocks", () => assert.ok(publishBlockers(sch(), []).some((m) => /active official source/.test(m))));
t("only inactive source blocks", () => assert.ok(publishBlockers(sch(), [vs({ active: false })]).length > 0));
t("unverified source blocks", () => assert.ok(publishBlockers(sch(), [vs({ last_verified_at: null })]).some((m) => /source as verified/.test(m))));
t("unverified scholarship blocks (fresh import state)", () => assert.ok(publishBlockers(sch({ last_verified_at: null }), [vs()]).some((m) => /scholarship as verified/.test(m))));
t("no official URL blocks", () => assert.ok(publishBlockers(sch({ official_information_url: null }), [vs()]).some((m) => /official information or application URL/.test(m))));
t("application URL alone satisfies official URL", () => assert.deepEqual(publishBlockers(sch({ official_information_url: null, official_application_url: "https://a.example" }), [vs()]), []));
t("non-http source/URL does not count", () => { assert.ok(publishBlockers(sch({ official_information_url: "javascript:1" }), [vs()]).length > 0); assert.ok(publishBlockers(sch(), [vs({ source_url: "ftp://x" })]).length > 0); });
t("missing required field blocks", () => { for (const k of ["name", "provider", "country_id", "degree_level", "funding_type"]) assert.ok(publishBlockers(sch({ [k]: "" }), [vs()]).length > 0, k); });
t("a freshly imported draft is never publishable", () => assert.ok(publishBlockers(sch({ last_verified_at: null }), [vs({ last_verified_at: null })]).length >= 2));

console.log("static: no accidental public records");
const imp = actions.split("export async function importScholarships(")[1];
t("import inserts only status draft and never touches last_verified_at", () => { assert.ok(/status: "draft"/.test(imp)); assert.ok(!/status: "active"/.test(imp)); assert.ok(!/last_verified_at/.test(imp)); });
t("import rejects existing duplicates case-insensitively, by country", () => { assert.ok(/\.in\("country_id", countryIds\)/.test(imp)); assert.ok(/toLowerCase\(\)/.test(imp)); });
t("import rolls back scholarships if sources fail", () => assert.ok(/import:rollback/.test(imp)));
const st = actions.split("export async function changeScholarshipStatus(")[1].split(/\nexport async function /)[0];
t("publish path calls publishBlockers before updating", () => { const a = st.indexOf("publishBlockers("); const b = st.indexOf('.update({ status: to })'); assert.ok(a > 0 && b > a, "gate missing or after update"); });
t("update/create cannot publish", () => { assert.ok(!/status: "active"/.test(actions)); });

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
