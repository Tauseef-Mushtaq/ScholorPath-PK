// In-memory Supabase stand-in for the profile tables (Repair Session 5). NOT real PostgREST and NOT real Postgres RLS.
// Column lists come from the REAL migrations, so selecting/filtering a column that does not exist fails like PostgREST would.
// RLS is hand-copied from supabase/migrations/20261001000300_rls_policies.sql (own rows; admins may read all profiles/education/experiences).
// `opts.noRls` simulates a policy that is wider than intended: it proves the application's own filters still scope every query.
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const ddl = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8")).join("\n");
const SCHEMA = {};
for (const m of ddl.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)) SCHEMA[m[1]] = m[2].split("\n").map((l) => /^  ([a-z_]+)\s/.exec(l)).filter((x) => x && !/^(constraint|primary|unique|check|foreign)$/.test(x[1])).map((x) => x[1]);

function visible(db, table, row, ctx, opts) {
  if (opts.noRls) return true;
  const auth = ctx.role === "authenticated", admin = auth && ctx.isAdmin;
  if (table === "profiles") return auth && (row.user_id === ctx.uid || admin);
  if (table === "education" || table === "experiences") return auth && (admin || db.profiles.some((p) => p.id === row.profile_id && p.user_id === ctx.uid));
  return false;
}
function makeClient(db, ctx, opts = {}) {
  const log = [];
  return { log, from(table) {
    const st = { eqs: [], orders: [], cols: "*", single: false };
    const b = {
      select(c) { st.cols = c; return b; }, eq(c, v) { st.eqs.push([c, v]); return b; },
      order(c, o = {}) { st.orders.push([c, o.ascending !== false, o.nullsFirst]); return b; },
      maybeSingle() { st.single = true; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    const err = (code, message) => ({ data: null, error: { code, message } });
    function run() {
      log.push({ table, eqs: st.eqs.slice(), cols: st.cols });
      if (opts.throwTable === table) throw new Error("network down");
      if (opts.failTable === table) return err("XX000", "boom");
      if (!SCHEMA[table]) return err("42P01", "no such table " + table);
      if (ctx.role === "anon") return err("42501", "permission denied");
      let rows = db[table].filter((r) => visible(db, table, r, ctx, opts));
      const cols = st.cols.split(",").map((c) => c.trim());
      for (const c of cols) if (c !== "*" && !SCHEMA[table].includes(c)) return err("42703", `column ${table}.${c} does not exist`);
      for (const [c] of st.eqs) if (!SCHEMA[table].includes(c)) return err("42703", `column ${table}.${c} does not exist`);
      for (const [c, v] of st.eqs) rows = rows.filter((r) => r[c] === v);
      for (const [c, asc, nf] of st.orders.slice().reverse()) {
        if (!SCHEMA[table].includes(c)) return err("42703", `order column ${c}`);
        rows = rows.slice().sort((a, z) => { const x = a[c], y = z[c]; if (x === y) return 0; if (x === null || x === undefined) return nf ? -1 : 1; if (y === null || y === undefined) return nf ? 1 : -1; return (x < y ? -1 : 1) * (asc ? 1 : -1); });
      }
      const out = rows.map((r) => (cols[0] === "*" ? { ...r } : Object.fromEntries(cols.map((c) => [c, r[c]]))));
      if (st.single) { if (out.length > 1) return err("PGRST116", "multiple rows"); return { data: out[0] ?? null, error: null }; }
      return { data: out, error: null };
    }
    return b;
  } };
}
module.exports = { makeClient, SCHEMA };
