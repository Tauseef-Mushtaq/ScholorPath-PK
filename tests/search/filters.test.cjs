// Unit tests for Module 08 pure helpers: URL param parsing, search tokens/clauses, deadline window, links.
const assert = require("node:assert/strict");
const path = require("node:path");
const F = require(path.join(process.argv[2], "filters.js"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message.split("\n")[0]); } };
const U1 = "123e4567-e89b-12d3-a456-426614174000", U2 = "223e4567-e89b-12d3-a456-426614174000";

console.log("parseScholarshipFilters");
t("empty params -> defaults", () => { const f = F.parseScholarshipFilters({}); assert.equal(f.page, 1); assert.equal(f.sort, "deadline"); assert.equal(F.hasActiveFilters(f), false); });
t("all filters parsed together", () => { const f = F.parseScholarshipFilters({ q: "computer science", country: "germany", university: "tu-berlin", degree: "Master", field: "CS", funding: "fully_funded", deadline: "90", open: "1", sort: "name", page: "3" }); assert.deepEqual([f.q, f.country, f.university, f.degree, f.field, f.funding, f.deadlineDays, f.openOnly, f.sort, f.page], ["computer science", "germany", "tu-berlin", "Master", "CS", "fully_funded", 90, true, "name", 3]); assert.equal(F.hasActiveFilters(f), true); });
t("`search` is an alias for q; q wins when both given", () => { assert.equal(F.parseScholarshipFilters({ search: "abc" }).q, "abc"); assert.equal(F.parseScholarshipFilters({ q: "x", search: "y" }).q, "x"); });
t("invalid values dropped, not passed through", () => { const f = F.parseScholarshipFilters({ country: "Not A Slug!", university: "../etc", funding: "free", deadline: "7", page: "abc", sort: "bogus" }); assert.equal(f.country, undefined); assert.equal(f.university, undefined); assert.equal(f.funding, undefined); assert.equal(f.deadlineDays, undefined); assert.equal(f.page, 1); assert.equal(f.sort, "deadline"); });
t("deadline window only 30/90/180", () => { for (const d of ["30", "90", "180"]) assert.equal(F.parseScholarshipFilters({ deadline: d }).deadlineDays, Number(d)); for (const d of ["0", "-30", "31", "1e2", "", "all"]) assert.equal(F.parseScholarshipFilters({ deadline: d }).deadlineDays, undefined); });
t("page clamped 1..500; array params use first", () => { assert.equal(F.parseScholarshipFilters({ page: "-9" }).page, 1); assert.equal(F.parseScholarshipFilters({ page: "99999" }).page, 500); assert.equal(F.parseScholarshipFilters({ q: ["a", "b"] }).q, "a"); });
t("q truncated to 80, control chars stripped", () => { const f = F.parseScholarshipFilters({ q: "x".repeat(200) + "\u0000" }); assert.equal(f.q.length, 80); assert.ok(!/[\u0000-\u001f]/.test(f.q)); });
t("whitespace-only q is empty (graceful)", () => { assert.equal(F.parseScholarshipFilters({ q: "   " }).q, undefined); assert.equal(F.hasActiveFilters(F.parseScholarshipFilters({ q: "   " })), false); });

console.log("scholarshipsHref (shareable URLs, reset, remove one filter)");
t("round trip: href -> parse gives the same filters", () => { const f = F.parseScholarshipFilters({ q: "ai", country: "uk", university: "oxford", degree: "PhD", funding: "partially_funded", deadline: "30", open: "1", sort: "name", page: "2" }); const url = new URL("http://x" + F.scholarshipsHref(f)); const back = F.parseScholarshipFilters(Object.fromEntries(url.searchParams)); assert.deepEqual(back, f); });
t("no filters -> bare /scholarships", () => assert.equal(F.scholarshipsHref(F.parseScholarshipFilters({})), "/scholarships"));
t("removing one filter keeps the others and resets page", () => { const f = F.parseScholarshipFilters({ q: "ai", country: "uk", page: "4" }); const href = F.scholarshipsHref(f, { country: undefined, page: 1 }); assert.equal(href, "/scholarships?q=ai"); });
t("special characters are URL-encoded", () => { const href = F.scholarshipsHref({ q: "a&b=c", sort: "deadline", page: 1 }); assert.equal(new URL("http://x" + href).searchParams.get("q"), "a&b=c"); });

console.log("search tokens + clauses");
t("tokens: lowercase, unique, max 5, max length 40", () => { assert.deepEqual(F.searchTokens("Computer  Science computer"), ["computer", "science"]); assert.equal(F.searchTokens("a b c d e f g").length, 5); assert.equal(F.searchTokens("x".repeat(100))[0].length, 40); });
t("empty / undefined / only-symbol search -> no tokens", () => { assert.deepEqual(F.searchTokens(undefined), []); assert.deepEqual(F.searchTokens(""), []); assert.deepEqual(F.searchTokens(",(*)%"), []); });
t("PostgREST-breaking characters never reach the clause", () => { const c = F.tokenOrClause('a,b)or(id.eq.1"', [], []); assert.ok(!/[()"]/.test(c.replace(/\.ilike\./g, "").replace(/(%|name|provider|field|degree_level|eligibility_summary|,|\.)/g, "")) ); assert.equal((c.match(/,/g) || []).length, 4); assert.ok(!c.includes("or(")); });
t("clause searches only real columns", () => { const c = F.tokenOrClause("ai", [], []); for (const col of ["name", "provider", "field", "degree_level", "eligibility_summary"]) assert.ok(c.includes(`${col}.ilike.%ai%`), col); assert.ok(!/university_id|country_id/.test(c)); });
t("university / country ids included only when valid UUIDs", () => { const c = F.tokenOrClause("x", [U1, "1;drop", U2], ["bad"]); assert.ok(c.includes(`university_id.in.(${U1},${U2})`)); assert.ok(!c.includes("drop")); assert.ok(!c.includes("country_id")); assert.ok(F.tokenOrClause("x", [], [U1]).includes(`country_id.in.(${U1})`)); });
t("idsMatchingToken: case-insensitive contains, ignores bad ids, capped", () => { const rows = [{ id: U1, name: "Technical University Berlin" }, { id: U2, name: "Oxford" }, { id: "nope", name: "Berlin Fake" }]; assert.deepEqual(F.idsMatchingToken("berlin", rows), [U1]); assert.deepEqual(F.idsMatchingToken("zzz", rows), []); const many = Array.from({ length: 300 }, (_, i) => ({ id: `123e4567-e89b-12d3-a456-${String(i).padStart(12, "0")}`, name: "berlin" })); assert.equal(F.idsMatchingToken("berlin", many).length, 100); });

console.log("deadline window");
t("range starts today and ends N days later (inclusive, month/year rollover)", () => { assert.deepEqual(F.deadlineRange(30, "2026-10-01"), { from: "2026-10-01", to: "2026-10-31" }); assert.deepEqual(F.deadlineRange(90, "2026-12-15"), { from: "2026-12-15", to: "2027-03-15" }); assert.equal(F.deadlineRange(180, "2027-02-28").to, "2027-08-27"); });
t("past dates are never inside the window", () => { const r = F.deadlineRange(30, "2026-10-01"); assert.ok("2026-09-30" < r.from); });

console.log("form identity");
t("filtersKey changes with any filter, ignores page", () => { const base = F.parseScholarshipFilters({}); const k0 = F.filtersKey(base); assert.equal(k0, "/scholarships"); assert.notEqual(F.filtersKey(F.parseScholarshipFilters({ country: "germany" })), k0); assert.notEqual(F.filtersKey(F.parseScholarshipFilters({ open: "1" })), k0); assert.equal(F.filtersKey(F.parseScholarshipFilters({ country: "germany", page: "4" })), F.filtersKey(F.parseScholarshipFilters({ country: "germany" }))); });
t("page.tsx remounts the uncontrolled filter form on filter change (stale-state regression)", () => { const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../src/app/scholarships/page.tsx"), "utf8"); assert.match(src, /<form\s+key=\{filtersKey\(filters\)\}/); });

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
