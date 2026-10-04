// Repair Session 3 — the REAL data path (src/lib/matching/queries.ts + src/lib/profile/queries.ts) against an
// in-memory Supabase stand-in. What this proves: identity -> own profile -> own education -> published scholarships
// -> requirements -> engine -> ranked result, including that every selected column exists in the real DDL.
// What it does NOT prove: real PostgREST parsing or real Postgres RLS. The stand-in re-implements the RLS policies
// from supabase/migrations/20261001000300_rls_policies.sql by hand; real RLS is tests/db (needs Postgres) and the
// live check against a real Supabase project (manual steps in docs/HANDOFF.md). Both were BLOCKED in this sandbox.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const OUT = process.argv[2];
const ROOT = path.join(__dirname, "..", "..");
let pass = 0, fail = 0, pending = Promise.resolve();
const t = (n, f) => { pending = pending.then(async () => { try { await f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", String(e.message).split("\n")[0]); } }); };
const TODAY = "2026-10-03";

// ---- real DDL -> column lists (so a select of a non-existent column fails exactly like PostgREST would) --------------
const ddl = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8")).join("\n");
const SCHEMA = {};
for (const m of ddl.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)) {
  SCHEMA[m[1]] = m[2].split("\n").map((l) => /^  ([a-z_]+)\s/.exec(l)).filter((x) => x && !/^(constraint|primary|unique|check|foreign)$/.test(x[1])).map((x) => x[1]);
}
for (const tb of ["profiles", "education", "experiences", "scholarships", "scholarship_requirements", "countries", "universities"]) assert.ok(SCHEMA[tb] && SCHEMA[tb].length, "DDL parsed for " + tb);

// ---- RLS (hand-copied from the policy file) ---------------------------------------------------------------------------
function visible(db, table, row, ctx) {
  const admin = ctx.role === "authenticated" && ctx.isAdmin;
  const auth = ctx.role === "authenticated";
  switch (table) {
    case "profiles": return auth && (row.user_id === ctx.uid || admin);
    case "education": case "experiences": return auth && (admin || db.profiles.some((p) => p.id === row.profile_id && p.user_id === ctx.uid));
    case "scholarships": return row.status === "active" || admin;
    case "scholarship_requirements": return admin || db.scholarships.some((s) => s.id === row.scholarship_id && s.status === "active");
    case "countries": case "universities": return true;
    default: return false;
  }
}
const splitTop = (s) => { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };

function makeClient(db, ctx, opts = {}) {
  return { from(table) {
    const st = { table, eqs: [], ors: [], orders: [], limit: null, cols: null, single: false };
    const b = {
      select(cols) { st.cols = cols; return b; },
      eq(c, v) { st.eqs.push([c, v]); return b; },
      or(expr) { st.ors.push(expr); return b; },
      order(c, o = {}) { st.orders.push([c, o.ascending !== false, o.nullsFirst]); return b; },
      limit(n) { st.limit = n; return b; },
      maybeSingle() { st.single = true; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    function err(code, message) { return { data: null, error: { code, message } }; }
    function run() {
      if (opts.failTable === table) return err("XX000", "boom");
      if (!SCHEMA[table]) return err("42P01", "no such table " + table);
      if (ctx.role === "anon" && ["profiles", "education", "experiences"].includes(table)) return err("42501", "permission denied");
      let rows = db[table].filter((r) => visible(db, table, r, ctx));
      const parts = splitTop(st.cols || "*");
      const plain = parts.filter((p) => !p.includes("("));
      for (const c of plain) if (c !== "*" && !SCHEMA[table].includes(c)) return err("42703", `column ${table}.${c} does not exist`);
      for (const [c] of st.eqs) if (!SCHEMA[table].includes(c)) return err("42703", `column ${table}.${c} does not exist`);
      for (const [c, v] of st.eqs) rows = rows.filter((r) => r[c] === v);
      for (const expr of st.ors) {
        const conds = expr.split(",").map((x) => x.split("."));
        rows = rows.filter((r) => conds.some(([c, op, v]) => (op === "is" && v === "null" ? r[c] === null : op === "gte" ? r[c] !== null && r[c] >= v : op === "lte" ? r[c] !== null && r[c] <= v : false)));
      }
      for (const [c, asc, nf] of st.orders.slice().reverse()) {
        if (!SCHEMA[table].includes(c)) return err("42703", `order column ${c}`);
        rows = rows.slice().sort((a, z) => { const x = a[c], y = z[c]; if (x === y) return 0; if (x === null) return nf ? -1 : 1; if (y === null) return nf ? 1 : -1; return (x < y ? -1 : 1) * (asc ? 1 : -1); });
      }
      const out = [];
      for (const r of rows) {
        const o = {}; let drop = false;
        for (const p of parts) {
          const em = /^(\w+)(!inner)?\(([^)]*)\)$/.exec(p);
          if (!em) { if (p === "*") Object.assign(o, r); else o[p] = r[p]; continue; }
          const [, name, inner, ecols] = em;
          const fk = { countries: ["country_id", "id"], universities: ["university_id", "id"], scholarship_requirements: ["scholarship_id", "id"] }[name];
          if (!fk) return err("PGRST200", "no relationship " + name);
          let related;
          if (name === "scholarship_requirements") related = db[name].filter((x) => x.scholarship_id === r.id && visible(db, name, x, ctx));
          else related = db[name].filter((x) => x.id === r[fk[0]] && visible(db, name, x, ctx));
          for (const c of ecols.split(",").map((x) => x.trim())) if (!SCHEMA[name].includes(c)) return err("42703", `column ${name}.${c} does not exist`);
          const proj = related.map((x) => Object.fromEntries(ecols.split(",").map((c) => [c.trim(), x[c.trim()]])));
          if (inner && proj.length === 0) { drop = true; break; }
          o[name] = name === "scholarship_requirements" ? proj : (proj[0] ?? null);
        }
        if (!drop) out.push(o);
      }
      const lim = st.limit === null ? out : out.slice(0, st.limit);
      if (st.single) { if (lim.length > 1) return err("PGRST116", "multiple rows"); return { data: lim[0] ?? null, error: null }; }
      return { data: lim, error: null };
    }
    return b;
  } };
}

// ---- module shims for the compiled sources ----------------------------------------------------------------------------
let anonClient = null;
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === "server-only") return path.join(__dirname, "empty-shim.cjs");
  if (req === "@/lib/supabase/public") return path.join(__dirname, "public-shim.cjs");
  if (req === "@/lib/profile/queries") return path.join(OUT, "lib/profile/queries.js");
  return origResolve.call(this, req, ...rest);
};
fs.writeFileSync(path.join(__dirname, "empty-shim.cjs"), "module.exports = {};\n");
fs.writeFileSync(path.join(__dirname, "public-shim.cjs"), "module.exports = { createPublicClient: () => global.__anonClient };\n");
process.on("exit", () => { for (const f of ["empty-shim.cjs", "public-shim.cjs"]) try { fs.unlinkSync(path.join(__dirname, f)); } catch {} });
const Q = require(path.join(OUT, "lib/matching/queries.js"));
const M = require(path.join(OUT, "lib/matching/index.js"));

// ---- seed ------------------------------------------------------------------------------------------------------------
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const US = { A: id(1), B: id(2), C: id(3), D: id(4), E: id(5), F: id(6) };
const PR = { A: id(11), B: id(12), C: id(13), D: id(14), E: id(15), F: id(16) };
const profileRow = (k, nat = "Pakistani") => ({ id: PR[k], user_id: US[k], role: "student", full_name: "Student " + k, nationality: nat, city: "Mardan", date_of_birth: null, created_at: "x", updated_at: "x" });
const eduRow = (k, n, o = {}) => ({ id: id(100 + n), profile_id: PR[k], level: "bachelor", degree_name: "BS", field: "Computer Science", institution: "NUST", cgpa: 3.6, cgpa_scale: 4, start_date: "2020-09-01", expected_graduation: "2024-06-30", created_at: "2026-01-0" + n, updated_at: "x", ...o });
const sRow = (n, o = {}) => ({ id: id(200 + n), name: "Scholarship " + n, provider: "Prov", country_id: id(900), university_id: null, degree_level: "Master", field: "Computer Science", funding_type: "fully_funded",
  eligibility_summary: null, minimum_gpa: 3.0, minimum_gpa_scale: 4, english_requirement_summary: null, opening_date: null, deadline: "2027-03-01", status: "active", ...o });
const db = {
  profiles: [profileRow("A"), profileRow("B"), profileRow("C"), profileRow("D"), profileRow("E"), profileRow("F")],
  education: [
    eduRow("A", 1),                                              // A: bachelor CS, CGPA 3.6/4, completed -> matches
    eduRow("B", 2, { level: "master", field: "Computer Science", cgpa: 3.8 }), // B: already holds a master's
    eduRow("C", 3, { cgpa: null, cgpa_scale: null }),            // C: no CGPA
    eduRow("D", 4, { field: "Law", cgpa: 3.4 }),                 // D: Law bachelor
    // E: profile exists, no education rows at all
    eduRow("F", 5, { cgpa: 2.5, cgpa_scale: 4 }),               // F: CGPA 2.5/4, below the 3.0/4 minimum
  ],
  experiences: [],
  countries: [{ id: id(900), name: "Testland", code: "TL", region: null, slug: "testland" }],
  universities: [],
  scholarships: [
    sRow(1),                                                           // Master CS, min GPA 3.0/4
    sRow(2, { name: "Master Medicine", field: "Medicine" }),
    sRow(3, { name: "Bachelor Any", degree_level: "Bachelor", field: null, minimum_gpa: null, minimum_gpa_scale: null }),
    sRow(4, { name: "Draft CS", status: "draft" }),
    sRow(5, { name: "Archived CS", status: "archived" }),
    sRow(6, { name: "Closed CS", deadline: "2026-01-01" }),
    sRow(7, { name: "PhD CS", degree_level: "PhD" }),
  ],
  scholarship_requirements: [
    { id: id(300), scholarship_id: id(201), requirement_type: "pakistan_side", title: "Attest degree", description: null, required: true, structured_value: null, source_id: null },
    { id: id(301), scholarship_id: id(204), requirement_type: "documents", title: "DRAFT-ONLY SECRET", description: null, required: true, structured_value: null, source_id: null },
  ],
};
const clientFor = (k) => makeClient(db, { role: "authenticated", uid: US[k], isAdmin: false });
global.__anonClient = makeClient(db, { role: "anon" });

async function matchesFor(k, opts = { includeClosed: false, showAll: false }) {
  const p = await Q.loadMatchProfile(clientFor(k), US[k]);
  if (!p.ok) return { profile: p };
  const c = await Q.loadCandidateScholarships(opts.includeClosed, TODAY);
  if (!c.ok) return { profile: p, candidates: c };
  return { profile: p, candidates: c, assessment: M.assessProfile(p.data), summary: M.buildMatches(p.data, c.data.items, TODAY, opts) };
}
const names = (s) => s.results.map((r) => r.scholarship.name);
const dec = (s, n) => s.results.find((r) => r.scholarship.name === n)?.decision;

console.log("Real flow: signed-in student -> own profile -> own education -> published scholarships -> engine");
t("every column the matching + profile queries select exists in the real migrations (field-name check)", async () => {
  for (const k of ["A", "B", "C", "D", "E", "F"]) { const p = await Q.loadMatchProfile(clientFor(k), US[k]); assert.equal(p.ok, true, k); }
  assert.equal((await Q.loadCandidateScholarships(false, TODAY)).ok, true);
});
t("Student A (matching degree + field + GPA): 'Scholarship 1' is eligible and listed first", async () => {
  const r = await matchesFor("A");
  assert.equal(r.assessment.readiness, "ready");
  assert.equal(names(r.summary)[0], "Scholarship 1"); assert.equal(dec(r.summary, "Scholarship 1"), "eligible");
  assert.equal(r.summary.counts.byDecision.eligible, 1 + 0 /* Master CS */ + 0);
});
t("Student A: Medicine, PhD (level unknown rule), draft, archived and closed are not presented as eligible matches", async () => {
  const r = await matchesFor("A");
  assert.ok(!names(r.summary).includes("Draft CS") && !names(r.summary).includes("Archived CS"));
  assert.ok(!names(r.summary).includes("Closed CS"), "closed hidden by default");
  assert.ok(!names(r.summary).includes("Master Medicine"), "other field hidden by default");
  for (const x of r.summary.results) if (x.decision === "eligible") assert.equal(x.scholarship.name, "Scholarship 1");
});
t("Student A: PhD scholarship is 'unknown' (a Bachelor's holder may or may not qualify), not eligible", async () => {
  const r = await matchesFor("A"); assert.equal(dec(r.summary, "PhD CS"), "unknown");
});
t("Student B (already holds a Master's): the Master's scholarship is not_eligible; PhD is the next step", async () => {
  const r = await matchesFor("B", { includeClosed: false, showAll: true });
  assert.equal(dec(r.summary, "Scholarship 1"), "not_eligible"); assert.equal(dec(r.summary, "PhD CS"), "eligible");
});
t("Student C (no CGPA): GPA-gated scholarship is needs_information, never eligible, with the profile pointer", async () => {
  const r = await matchesFor("C");
  const x = r.summary.results.find((q) => q.scholarship.name === "Scholarship 1");
  assert.equal(x.decision, "needs_information");
  assert.deepEqual(M.explainResult(x).missing.map((m) => [m.what, m.href]), [["CGPA and CGPA scale", "/profile#education"]]);
  assert.equal(r.summary.counts.byDecision.eligible, 0, "no scholarship may be eligible for Student C (all master's ones need a GPA or are other fields)");
  assert.equal(r.assessment.readiness, "partial");
});
t("Student D (Law bachelor): nothing suitable -> no match shown, hidden count reported", async () => {
  const r = await matchesFor("D");
  assert.equal(r.summary.results.filter((x) => x.decision === "eligible").length, 0);
  assert.ok(r.summary.counts.hiddenNotRelevant >= 3);
});
t("Student E (profile row, zero education): readiness 'empty' (page asks for education; no scholarship is evaluated)", async () => {
  const r = await matchesFor("E"); assert.equal(r.profile.ok, true); assert.equal(r.assessment.readiness, "empty");
});
t("pakistan_side rows are loaded but never become an eligibility check", async () => {
  const c = await Q.loadCandidateScholarships(false, TODAY);
  const s1 = c.data.items.find((s) => s.name === "Scholarship 1"); assert.equal(s1.requirements.length, 1);
  assert.equal(M.evaluateScholarship((await Q.loadMatchProfile(clientFor("A"), US.A)).data, s1, TODAY).checks.filter((x) => x.key === "requirement").length, 0);
});

t("profile mapping is exact: DB columns reach the engine under the right names (A, converted to numbers)", async () => {
  const p = await Q.loadMatchProfile(clientFor("A"), US.A);
  assert.deepEqual(p.data.education, [{ level: "bachelor", field: "Computer Science", cgpa: 3.6, cgpaScale: 4, startDate: "2020-09-01", expectedGraduation: "2024-06-30" }]);
  assert.equal(p.data.nationality, "Pakistani");
});
t("Student F (CGPA 2.5/4 < 3.0/4): 'Scholarship 1' is not_eligible with a GPA reason (visible, not hidden)", async () => {
  const r = await matchesFor("F");
  const x = r.summary.results.find((q) => q.scholarship.name === "Scholarship 1");
  assert.equal(x.decision, "not_eligible"); assert.match(x.checks.find((c) => c.key === "gpa").detail, /below the minimum/);
});

console.log("Isolation: Student A cannot read Student B's data");
t("loadMatchProfile(A's client, B's user id) returns nothing (no profile, no education)", async () => {
  const r = await Q.loadMatchProfile(clientFor("A"), US.B); assert.equal(r.ok, false); assert.equal(JSON.stringify(r).includes("master"), false);
});
t("A's client cannot list B's profile or education even when asking by id", async () => {
  const c = clientFor("A");
  const p = await c.from("profiles").select("id,user_id").eq("user_id", US.B).maybeSingle(); assert.equal(p.data, null);
  const all = await c.from("profiles").select("id,user_id"); assert.deepEqual(all.data.map((x) => x.user_id), [US.A]);
  const e = await c.from("education").select("id,level").eq("profile_id", PR.B); assert.deepEqual(e.data, []);
  const allEdu = await c.from("education").select("id,profile_id"); assert.ok(allEdu.data.every((x) => x.profile_id === PR.A));
});
t("A's matches are computed from A's rows only: A's result is identical whatever B's data is", async () => {
  const before = JSON.stringify((await matchesFor("A")).summary.results.map((r) => [r.scholarship.id, r.decision]));
  db.education.find((x) => x.profile_id === PR.B).level = "bachelor";
  const after = JSON.stringify((await matchesFor("A")).summary.results.map((r) => [r.scholarship.id, r.decision]));
  db.education.find((x) => x.profile_id === PR.B).level = "master";
  assert.equal(before, after);
});
t("anonymous visitors cannot read profiles/education; scholarships of draft/archived and their requirements stay invisible", async () => {
  const anon = global.__anonClient;
  assert.equal((await anon.from("profiles").select("id")).error.code, "42501");
  assert.equal((await anon.from("education").select("id")).error.code, "42501");
  const c = await Q.loadCandidateScholarships(true, TODAY);
  assert.ok(c.data.items.every((s) => s.status === "active"));
  assert.ok(!JSON.stringify(c.data.items).includes("DRAFT-ONLY SECRET"));
});
t("a forged user id cannot be used to widen access (RLS filters even an explicit foreign id)", async () => {
  assert.equal((await Q.loadMatchProfile(clientFor("D"), US.A)).ok, false);
});

console.log("Failure handling");
t("a failing profile query is a generic failure (ok:false), never an empty 'no matches' success", async () => {
  const bad = makeClient(db, { role: "authenticated", uid: US.A, isAdmin: false }, { failTable: "education" });
  assert.equal((await Q.loadMatchProfile(bad, US.A)).ok, false);
});
t("a failing scholarship query is ok:false (page shows 'temporarily unavailable'), not an empty catalogue", async () => {
  const saved = global.__anonClient; global.__anonClient = makeClient(db, { role: "anon" }, { failTable: "scholarships" });
  const r = await Q.loadCandidateScholarships(false, TODAY); global.__anonClient = saved; assert.equal(r.ok, false);
});
t("numeric columns arriving as strings are converted (not treated as missing)", () => {
  const s = Q.toMatchScholarship({ ...sRow(1), minimum_gpa: "3.00", minimum_gpa_scale: "4.00", countries: { name: "T", slug: "t" }, universities: null, scholarship_requirements: [] });
  assert.equal(s.minimumGpa, 3); assert.equal(s.minimumGpaScale, 4);
});

pending.then(() => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); });
