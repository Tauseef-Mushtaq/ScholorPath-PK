// Unit tests for Module 10 pure logic: requirement grouping, Pakistan-side split, verification state,
// application phase, link safety, source building and attribution.
const assert = require("node:assert/strict");
const path = require("node:path");
const D = require(path.join(process.argv[2], "detail.js"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message.split("\n")[0]); } };
const req = (o) => ({ id: "r", requirementType: "documents", title: "T", description: null, required: true, sourceId: null, ...o });
const src = (o) => ({ id: "s", sourceUrl: "https://example.org/a", sourceName: "Src", sourceType: "official_provider", priority: 1, lastVerifiedAt: null, ...o });
const TODAY = "2026-10-02";

console.log("requirements");
t("Pakistan-side rows are split out, in any spelling/case, and never mixed into general groups", () => {
  const r = D.splitRequirements([req({ id: "a", requirementType: "pakistan_side" }), req({ id: "b", requirementType: " Pakistan-Side " }), req({ id: "c", requirementType: "Pakistan Side" }), req({ id: "d" })]);
  assert.deepEqual(r.pakistan.map((x) => x.id).sort(), ["a", "b", "c"]);
  assert.deepEqual(r.general.map((g) => g.key), ["documents"]);
});
t("types that merely contain 'pakistan' are NOT treated as Pakistan-side", () => {
  assert.equal(D.isPakistanSide({ requirementType: "pakistan_quota" }), false);
  assert.equal(D.isPakistanSide({ requirementType: "pakistan_side_extra" }), false);
});
t("groups sorted by label with 'other' last; required first then title; deterministic", () => {
  const items = [req({ id: "1", requirementType: "other", title: "Z" }), req({ id: "2", requirementType: "language", title: "B", required: false }), req({ id: "3", requirementType: "language", title: "A" }), req({ id: "4", requirementType: "documents", title: "M" }), req({ id: "5", requirementType: "", title: "Q" })];
  const g = D.splitRequirements(items).general;
  assert.deepEqual(g.map((x) => x.key), ["documents", "language", "other"]);
  assert.deepEqual(g[1].items.map((x) => x.id), ["3", "2"]);
  assert.deepEqual(g[2].items.map((x) => x.id).sort(), ["1", "5"]);
  assert.deepEqual(D.splitRequirements([...items].reverse()).general.map((x) => x.key), ["documents", "language", "other"]);
});
t("empty input -> empty result", () => { const r = D.splitRequirements([]); assert.deepEqual([r.general, r.pakistan], [[], []]); });

console.log("verification state");
t("null / garbage / future dates are NEVER verified", () => {
  for (const v of [null, "", "not a date", "2026-13-45x", "2027-01-01", "2026-10-03T00:00:00Z"]) {
    const s = D.verificationState(v, TODAY);
    assert.equal(s.kind, "never", String(v)); assert.equal(s.dateText, null); assert.match(s.message, /not been verified/);
  }
});
t("recent date -> 'recent', mentions the date, does not claim the details are correct", () => {
  const s = D.verificationState("2026-09-01T10:00:00Z", TODAY);
  assert.equal(s.kind, "recent"); assert.match(s.message, /1 September 2026/); assert.match(s.message, /can still change/); assert.doesNotMatch(s.message, /confirmed|guaranteed|accurate/i);
});
t("stale boundary: 180 days is recent, 181 is stale", () => {
  assert.equal(D.verificationState("2026-04-05", TODAY).kind, "recent"); // 180 days
  assert.equal(D.verificationState("2026-04-04", TODAY).kind, "stale"); // 181 days
  assert.match(D.verificationState("2025-10-02", TODAY).message, /about 12 months ago/);
});
t("today counts as recent", () => assert.equal(D.verificationState("2026-10-02T00:00:00Z", TODAY).kind, "recent"));

console.log("application phase");
t("deadline passed -> closed (even if opening date is in the future / bad)", () => {
  assert.equal(D.applicationPhase(null, "2026-10-01", TODAY).kind, "closed");
  assert.equal(D.applicationPhase("2027-01-01", "2026-10-01", TODAY).kind, "closed");
});
t("deadline today / tomorrow / N days / far", () => {
  assert.equal(D.applicationPhase(null, "2026-10-02", TODAY).label, "Deadline is today");
  assert.equal(D.applicationPhase(null, "2026-10-03", TODAY).label, "Deadline tomorrow");
  assert.equal(D.applicationPhase(null, "2026-10-12", TODAY).label, "Deadline in 10 days");
  assert.equal(D.applicationPhase(null, "2026-12-01", TODAY).label, "Deadline in 60 days");
  assert.equal(D.applicationPhase(null, "2026-12-02", TODAY).label, "Applications open");
});
t("not yet open -> upcoming with the opening date", () => {
  const p = D.applicationPhase("2026-11-01", "2027-01-31", TODAY); assert.equal(p.kind, "upcoming"); assert.match(p.label, /Opens 1 November 2026/);
});
t("no / invalid deadline -> unknown (never 'open' or 'closed')", () => {
  for (const d of [null, "", "garbage"]) assert.equal(D.applicationPhase(null, d, TODAY).kind, "unknown");
  assert.equal(D.applicationPhase("2026-01-01", null, TODAY).kind, "unknown");
});
t("month/year rollover is correct", () => assert.equal(D.applicationPhase(null, "2027-01-02", "2026-12-31").label, "Deadline in 2 days"));

console.log("links and sources");
t("linkView: https/http only, host without www; others rejected", () => {
  assert.deepEqual(D.linkView("https://www.daad.de/en/x?y=1"), { href: "https://www.daad.de/en/x?y=1", host: "daad.de" });
  assert.equal(D.linkView("http://example.org/").host, "example.org");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.org", "//evil.com", "not a url", "", null, undefined, "file:///etc/passwd", "vbscript:x"]) assert.equal(D.linkView(bad), null, String(bad));
});
t("buildSources: official links come only from stored URLs; unsafe URLs dropped everywhere", () => {
  const v = D.buildSources({ officialApplicationUrl: "javascript:x", officialInformationUrl: "https://a.org/i", university: { name: "Uni", website: "https://uni.edu" }, sources: [src({ id: "bad", sourceUrl: "javascript:alert(1)" }), src({ id: "good" })] });
  assert.deepEqual(v.official.map((o) => o.label), ["Official information page", "Uni website"]);
  assert.deepEqual(v.recorded.map((s) => s.id), ["good"]);
  assert.equal(v.byId.has("bad"), false);
});
t("buildSources: ordered by priority then name; type shown as recorded, never upgraded to 'official'", () => {
  const v = D.buildSources({ officialApplicationUrl: null, officialInformationUrl: null, university: null, sources: [src({ id: "3", priority: 2, sourceName: "B" }), src({ id: "1", priority: 1, sourceName: "Z", sourceType: "secondary_blog" }), src({ id: "2", priority: 1, sourceName: "A", sourceType: null })] });
  assert.deepEqual(v.recorded.map((s) => s.id), ["2", "1", "3"]);
  assert.equal(v.recorded[0].typeLabel, "Type not recorded"); assert.equal(v.recorded[1].typeLabel, "Secondary blog");
});
t("source name falls back to host; verified date formatted or null", () => {
  const v = D.buildSources({ officialApplicationUrl: null, officialInformationUrl: null, university: null, sources: [src({ sourceName: null, lastVerifiedAt: "2026-05-04T00:00:00Z" })] });
  assert.equal(v.recorded[0].name, "example.org"); assert.equal(v.recorded[0].verifiedText, "4 May 2026");
});
t("sourceFor: attribution only to a visible source; hidden/unknown/null -> null", () => {
  const v = D.buildSources({ officialApplicationUrl: null, officialInformationUrl: null, university: null, sources: [src({ id: "s1" })] });
  assert.equal(D.sourceFor({ sourceId: "s1" }, v.byId).id, "s1");
  assert.equal(D.sourceFor({ sourceId: "hidden" }, v.byId), null);
  assert.equal(D.sourceFor({ sourceId: null }, v.byId), null);
});
t("empty scholarship (no URLs, no sources) -> empty views, no throw", () => {
  const v = D.buildSources({ officialApplicationUrl: null, officialInformationUrl: null, university: null, sources: [] });
  assert.deepEqual([v.official, v.recorded, v.byId.size], [[], [], 0]);
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
