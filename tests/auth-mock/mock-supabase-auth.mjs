// Minimal MOCK of Supabase GoTrue endpoints (+ a tiny PostgREST `profiles` endpoint) used by @supabase/ssr.
// NOT real Supabase. `u.role` = app_metadata.role (must be IGNORED by the app); `u.profileRole` = profiles.role.
import http from "node:http";
import crypto from "node:crypto";

const SECRET = "mock-secret";
const CONFIRM = process.env.CONFIRM === "1"; // require email confirmation on signup
const users = new Map(); // email -> {id,email,password,role,profileRole,confirmed}
let profilesFail = false; // simulate a failing profiles lookup
const refreshTokens = new Map(); // token -> email
const codes = new Map(); // code -> email
const log = []; // received requests for assertions

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function jwt(u, ttl = Number(process.env.TTL || 3600)) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({
    sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + ttl,
    session_id: "sess-" + u.id, aal: "aal1", is_anonymous: false,
    app_metadata: { provider: "email", ...(u.role ? { role: u.role } : {}) },
    user_metadata: u.user_metadata || {},
  });
  const sig = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}
const userObj = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
  email_confirmed_at: u.confirmed ? new Date().toISOString() : null,
  app_metadata: { provider: "email", ...(u.role ? { role: u.role } : {}) },
  user_metadata: u.user_metadata || {}, created_at: new Date().toISOString(),
});
function session(u, ttl = Number(process.env.TTL || 3600)) {
  const rt = crypto.randomUUID(); refreshTokens.set(rt, u.email);
  return { access_token: jwt(u, ttl), token_type: "bearer", expires_in: ttl,
    expires_at: Math.floor(Date.now() / 1000) + ttl, refresh_token: rt, user: userObj(u) };
}
const err = (res, status, code, msg) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ code: status, error_code: code, msg }));
};
const ok = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
function authUser(req) {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  const [h, p, s] = t.split(".");
  if (!s) return null;
  const exp = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (exp !== s) return null;
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  if (payload.exp < Date.now() / 1000) return null;
  return [...users.values()].find((u) => u.id === payload.sub) || null;
}

// --- Tiny PostgREST emulation for profiles / education / experiences (Module 02 + 05 tests). ---
// RLS emulation: a caller only ever sees / changes rows that belong to their OWN profile. Column
// grants are emulated too: role / user_id / id / profile_id can never be changed by a client.
// This is NOT Postgres: real RLS is verified by tests/db (and the live project).
let restFail = false;
const eqv = (url, k) => { const v = url.searchParams.get(k); return v && v.startsWith("eq.") ? v.slice(3) : null; };
const pgErr = (res, status, code, msg) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ code, message: msg, details: null, hint: null })); };
const EDU_COLS = ["level", "degree_name", "field", "institution", "cgpa", "cgpa_scale", "start_date", "expected_graduation"];
const EXP_COLS = ["experience_type", "title", "organization", "description", "start_date", "end_date"];
// Public scholarship data (Module 09). Emulates what the ANON role sees through RLS: ACTIVE scholarships only
// (+ their requirements), reachable WITHOUT a user JWT. Seeded via /_mock/set-scholarships. NOT Postgres.
let scholarshipsDb = [];
let leakNonActive = false; // test hook: simulate a BROKEN RLS that also returns drafts/archived (the app must still exclude them)
function scholarshipsRest(req, res, url) {
  if (restFail) return pgErr(res, 500, "XX000", "mock: rest failure");
  if (req.method !== "GET") return pgErr(res, 403, "42501", "permission denied for table scholarships");
  let rows = scholarshipsDb.filter((s) => leakNonActive || s.status === "active"); // RLS: scholarships_select_active
  const orParam = url.searchParams.get("or") || "";
  const m = /deadline\.gte\.(\d{4}-\d{2}-\d{2})/.exec(orParam);
  if (m) rows = rows.filter((s) => !s.deadline || s.deadline >= m[1]);
  rows = rows.slice().sort((a, b) => (a.deadline ?? "9999") < (b.deadline ?? "9999") ? -1 : (a.deadline ?? "9999") > (b.deadline ?? "9999") ? 1 : a.id < b.id ? -1 : 1);
  const limit = Number(url.searchParams.get("limit") || 1000);
  return ok(res, rows.slice(0, limit).map((s) => ({
    id: s.id, name: s.name, provider: s.provider, status: s.status, degree_level: s.degree_level, field: s.field ?? null,
    funding_type: s.funding_type ?? "fully_funded", deadline: s.deadline ?? null, minimum_gpa: s.minimum_gpa ?? null,
    minimum_gpa_scale: s.minimum_gpa_scale ?? null, english_requirement_summary: s.english_requirement_summary ?? null,
    eligibility_summary: s.eligibility_summary ?? null, countries: { name: "Testland", slug: "testland" },
    universities: s.university ? { name: s.university } : null,
    scholarship_requirements: (s.requirements || []).map((r, i) => ({ id: s.id + "-r" + i, requirement_type: r.type || "other", title: r.title, description: r.description ?? null, required: r.required !== false })),
  })));
}
function rest(req, res, url, body, path) {
  if (path.split("/")[3] === "scholarships") return scholarshipsRest(req, res, url);
  const u = authUser(req);
  if (!u) return pgErr(res, 401, "PGRST301", "JWT invalid");
  if (restFail) return pgErr(res, 500, "XX000", "mock: rest failure");
  const table = path.split("/")[3];
  const wantsRep = /return=representation/.test(req.headers.prefer || "");
  const send = (rows, status = 200) => ok(res, rows, status);
  const sendWrite = (rows, status) => (wantsRep ? send(rows, status) : ok(res, undefined, status === 201 ? 201 : 204));

  if (table === "profiles") {
    if (profilesFail && req.method === "GET") return pgErr(res, 500, "XX000", "mock: profiles lookup failure");
    if (!u.profileRole) return req.method === "GET" ? send([]) : sendWrite([], 200);
    const mine = { id: u.profileId, user_id: u.id, role: u.profileRole, ...u.profile };
    const uid = eqv(url, "user_id");
    const visible = uid === u.id;
    if (req.method === "GET") return send(visible ? [mine] : []);
    if (req.method === "PATCH") {
      if (!visible) return sendWrite([], 200);
      for (const k of Object.keys(body)) if (!["full_name", "nationality", "city", "date_of_birth"].includes(k)) return pgErr(res, 403, "42501", "permission denied for table profiles");
      if (body.full_name && body.full_name.length > 200) return pgErr(res, 400, "23514", "check violation");
      Object.assign(u.profile, body);
      return sendWrite([{ id: u.profileId }], 200);
    }
    return pgErr(res, 403, "42501", "permission denied");
  }

  if (table === "education" || table === "experiences") {
    const cols = table === "education" ? EDU_COLS : EXP_COLS;
    const list = table === "education" ? u.education : u.experiences;
    const id = eqv(url, "id"), pid = eqv(url, "profile_id");
    const mineRows = () => list.filter((r) => (!id || r.id === id) && (!pid || pid === u.profileId));
    if (req.method === "GET") return send(pid && pid !== u.profileId ? [] : mineRows());
    if (req.method === "POST") {
      const rows = Array.isArray(body) ? body : [body];
      const made = [];
      for (const r of rows) {
        if (r.profile_id !== u.profileId) return pgErr(res, 403, "42501", "new row violates row-level security policy for table " + table);
        for (const k of Object.keys(r)) if (k !== "profile_id" && !cols.includes(k)) return pgErr(res, 403, "42501", "permission denied (column " + k + ")");
        if (table === "education" && r.cgpa != null && r.cgpa_scale != null && r.cgpa > r.cgpa_scale) return pgErr(res, 400, "23514", "check violation");
        made.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...Object.fromEntries(cols.map((c) => [c, null])), ...r });
      }
      list.push(...made);
      return sendWrite(made, 201);
    }
    if (req.method === "PATCH") {
      for (const k of Object.keys(body)) if (!cols.includes(k)) return pgErr(res, 403, "42501", "permission denied (column " + k + ")");
      const rows = mineRows(); // rows owned by OTHER users are invisible -> 0 rows updated
      rows.forEach((r) => Object.assign(r, body));
      return sendWrite(rows, 200);
    }
    if (req.method === "DELETE") {
      const rows = mineRows();
      for (const r of rows) list.splice(list.indexOf(r), 1);
      return sendWrite(rows, 200);
    }
  }
  return pgErr(res, 404, "PGRST205", "mock: " + path);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let body = {};
  const chunks = []; for await (const c of req) chunks.push(c);
  if (chunks.length) try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
  const path = url.pathname;
  log.push({ method: req.method, path, userJwt: !!authUser(req), query: Object.fromEntries(url.searchParams), body: { ...body, password: body.password ? "***" : undefined } });

  if (path === "/_mock/log") return ok(res, log);
  if (path === "/_mock/reset") { log.length = 0; return ok(res, {}); }
  if (path === "/_mock/set-role") { users.get(body.email).profileRole = body.role; return ok(res, {}); }          // profiles.role
  if (path === "/_mock/set-app-role") { users.get(body.email).role = body.role; return ok(res, {}); }          // app_metadata.role (must be ignored)
  if (path === "/_mock/drop-profile") { users.get(body.email).profileRole = undefined; return ok(res, {}); }   // user without a profile row
  if (path === "/_mock/rest-fail") { restFail = !!body.fail; return ok(res, {}); }
  if (path === "/_mock/db") { const u = users.get(body.email); return ok(res, { userId: u.id, profile: u.profile, role: u.profileRole, education: u.education, experiences: u.experiences, profileId: u.profileId }); }
  if (path === "/_mock/leak-nonactive") { leakNonActive = !!body.on; return ok(res, {}); }
  if (path === "/_mock/set-scholarships") { scholarshipsDb = Array.isArray(body) ? body : []; return ok(res, {}); }
  if (path === "/_mock/set-education") { const u = users.get(body.email); u.education = (body.education || []).map((e) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), degree_name: null, institution: "Test", cgpa: null, cgpa_scale: null, start_date: null, expected_graduation: null, field: null, ...e })); return ok(res, {}); }
  if (path === "/_mock/profiles-fail") { profilesFail = !!body.fail; return ok(res, {}); }
  if (path === "/_mock/code") { return ok(res, { code: [...codes.keys()].pop() }); }
  if (path === "/_mock/confirm") { users.get(body.email).confirmed = true; return ok(res, {}); }
  if (path === "/auth/v1/.well-known/jwks.json") return ok(res, { keys: [] });

  if (path === "/auth/v1/signup" && req.method === "POST") {
    if (users.has(body.email)) return err(res, 422, "user_already_exists", "User already registered");
    if ((body.password || "").toLowerCase() === "password") return err(res, 422, "weak_password", "Password is known to be weak");
    const u = { id: crypto.randomUUID(), email: body.email, password: body.password, confirmed: !CONFIRM, user_metadata: body.data, profileRole: "student" /* DB trigger default */, profileId: crypto.randomUUID(), profile: { full_name: null, nationality: null, city: null }, education: [], experiences: [] };
    users.set(u.email, u);
    return CONFIRM ? ok(res, userObj(u)) : ok(res, session(u));
  }
  if (path === "/auth/v1/token" && req.method === "POST") {
    const gt = url.searchParams.get("grant_type");
    if (gt === "password") {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return err(res, 400, "invalid_credentials", "Invalid login credentials");
      if (!u.confirmed) return err(res, 400, "email_not_confirmed", "Email not confirmed");
      return ok(res, session(u));
    }
    if (gt === "pkce") {
      const email = codes.get(body.auth_code);
      if (!email || !body.code_verifier) return err(res, 400, "flow_state_not_found", "invalid flow state");
      codes.delete(body.auth_code);
      return ok(res, session(users.get(email)));
    }
    if (gt === "refresh_token") {
      const email = refreshTokens.get(body.refresh_token);
      if (!email) return err(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
      return ok(res, session(users.get(email)));
    }
  }
  if (path === "/auth/v1/user") {
    const u = authUser(req);
    if (!u) return err(res, 401, "bad_jwt", "invalid JWT");
    if (req.method === "GET") return ok(res, userObj(u));
    if (req.method === "PUT") {
      if (body.password) {
        if (body.password === u.password) return err(res, 422, "same_password", "New password should be different from the old password.");
        u.password = body.password;
      }
      return ok(res, userObj(u));
    }
  }
  if (path.startsWith("/rest/v1/")) return rest(req, res, url, body, path);
  if (path === "/auth/v1/logout") return ok(res, undefined, 204);
  if (path === "/auth/v1/recover" && req.method === "POST") {
    const u = users.get(body.email);
    if (u) codes.set("code-" + crypto.randomUUID(), u.email);
    return ok(res, {}); // identical response whether or not the user exists
  }
  err(res, 404, "not_found", "mock: " + path);
}).listen(54321, "127.0.0.1", () => console.log("mock on 54321"));
