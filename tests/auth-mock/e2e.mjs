const BASE = "http://localhost:3200";
const MOCK = "http://127.0.0.1:54321";
let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name, extra); }
};
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

class Client {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(";");
      const i = pair.indexOf("="); const name = pair.slice(0, i).trim(); const value = pair.slice(i + 1).trim();
      const maxAge = attrs.find((a) => /max-age/i.test(a));
      const expired = (maxAge && Number(maxAge.split("=")[1]) <= 0) || value === "";
      if (expired) this.jar.delete(name); else this.jar.set(name, value);
    }
  }
  async req(path, init = {}) {
    const res = await fetch(BASE + path, { redirect: "manual", ...init, headers: { cookie: this.cookieHeader(), origin: BASE, ...(init.headers || {}) } });
    this.store(res);
    const text = await res.text();
    return { status: res.status, loc: res.headers.get("location"), text, res };
  }
  get(path) { return this.req(path); }
  async submit(path, fields, { formIndex = 0 } = {}) {
    const page = await this.get(path);
    const forms = page.text.split("<form").slice(1);
    const first = Object.keys(fields)[0];
    const form = (first && forms.find((f) => f.includes(`name="${first}"`))) || forms[formIndex];
    const fd = new FormData();
    for (const tag of form.match(/<input[^>]*>/g) || []) {
      if (!/type="hidden"/.test(tag)) continue;
      const name = decode((tag.match(/name="([^"]*)"/) || [])[1] || "");
      const value = decode((tag.match(/value="([^"]*)"/) || [])[1] || "");
      if (name) fd.append(name, value);
    }
    for (const [k, v] of Object.entries(fields)) { fd.delete(k); fd.append(k, v); }
    return this.req(path, { method: "POST", body: fd });
  }
  hasSession() { return [...this.jar.keys()].some((k) => /auth-token/.test(k) && !/code-verifier/.test(k)); }
}
const mock = async (p, body) => (await fetch(MOCK + p, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })).json();
const loc = (l) => (l || "").replace(BASE, "");

const PHASE = process.argv[2];

if (PHASE === "main") {
  const email = "student@example.com";

  console.log("A. Unauthenticated access");
  {
    const c = new Client();
    for (const p of ["/dashboard", "/profile", "/documents", "/matches", "/applications", "/ai", "/ai/chat", "/mentor/dashboard", "/mentor/stories/new", "/admin", "/admin/users"]) {
      const r = await c.get(p);
      check(`${p} -> /login`, r.status === 307 && loc(r.loc).startsWith("/login?next="), `${r.status} ${r.loc}`);
    }
    let r = await c.get("/dashboard"); check("next param preserved", loc(r.loc) === "/login?next=%2Fdashboard", r.loc);
    r = await c.get("/mentors"); check("/mentors stays public (no auth redirect)", r.status !== 307, String(r.status));
    for (const p of ["/", "/login", "/signup", "/forgot-password"]) { r = await c.get(p); check(`${p} 200`, r.status === 200, String(r.status)); }
    r = await c.get("/"); check("header shows Log in/Sign up when signed out", r.text.includes("Log in") && r.text.includes("Sign up") && !r.text.includes("Log out"));
    r = await c.get("/reset-password"); check("/reset-password without session -> /forgot-password?error=expired", r.status === 307 && loc(r.loc) === "/forgot-password?error=expired", `${r.status} ${r.loc}`);
    r = await c.get("/forgot-password?error=expired"); check("expired notice rendered", r.text.includes("invalid or has expired"));
    r = await c.get("/api/health"); check("health route public", r.status === 200);
  }

  console.log("B. Signup validation (must not call Supabase)");
  {
    await mock("/_mock/reset", {});
    const c = new Client();
    let r = await c.submit("/signup", { email: "not-an-email", password: "longenough1", confirmPassword: "longenough1" });
    check("bad email message", r.text.includes("Enter a valid email address."));
    r = await c.submit("/signup", { email: email, password: "short", confirmPassword: "short" });
    check("short password message", r.text.includes("at least 8 characters"));
    r = await c.submit("/signup", { email: email, password: "longenough1", confirmPassword: "different1" });
    check("mismatch message", r.text.includes("Passwords do not match."));
    check("email retained after error", r.text.includes(`value="${email}"`));
    check("password never echoed", !r.text.includes("longenough1") && !r.text.includes("different1"));
    const log = await mock("/_mock/log");
    check("no signup request reached Supabase", !log.some((l) => l.path === "/auth/v1/signup"));
  }

  console.log("C. Signup success + session");
  const c = new Client();
  {
    await mock("/_mock/reset", {});
    let r = await c.submit("/signup", { email, password: "Correct-horse-1", confirmPassword: "Correct-horse-1" });
    check("signup redirects to /dashboard", r.status === 303 && loc(r.loc) === "/dashboard", `${r.status} ${r.loc}`);
    check("session cookie set", c.hasSession());
    const log = await mock("/_mock/log");
    const su = log.find((l) => l.path === "/auth/v1/signup");
    check("signup body has no role/metadata", su && !("role" in su.body) && Object.keys(su.body.data || {}).length === 0, JSON.stringify(su?.body));
    check("emailRedirectTo points at /auth/callback", /auth\/callback/.test(su?.query.redirect_to || ""), JSON.stringify(su?.query));
    r = await c.get("/dashboard");
    check("authenticated /dashboard 200", r.status === 200 && r.text.includes(email), String(r.status));
    check("default role is student", r.text.includes("Role: student") || r.text.includes("Role: </!-- -->student") || /Role:[^<]*(<!--.*?-->)?\s*student/.test(r.text));
    check("header shows Log out when signed in", r.text.includes("Log out"));
    r = await c.get("/login"); check("/login redirects authed user to /dashboard", r.status === 307 && loc(r.loc) === "/dashboard");
    r = await c.get("/signup"); check("/signup redirects authed user to /dashboard", r.status === 307 && loc(r.loc) === "/dashboard");
  }

  console.log("D. Role enforcement (student)");
  {
    let r = await c.get("/admin"); check("student /admin -> /dashboard", r.status === 307 && loc(r.loc) === "/dashboard", `${r.status} ${r.loc}`);
    r = await c.get("/admin/users"); check("student /admin/users -> /dashboard", loc(r.loc) === "/dashboard");
    r = await c.get("/mentor/dashboard"); check("student /mentor/dashboard -> /dashboard", loc(r.loc) === "/dashboard");
    r = await c.get("/mentor/stories/new"); check("student /mentor/stories/new -> /dashboard", loc(r.loc) === "/dashboard");
    r = await c.get("/mentor/apply"); check("student /mentor/apply allowed (no redirect)", r.status !== 307, String(r.status));
    r = await c.get("/profile"); check("student /profile allowed (no redirect)", r.status !== 307, String(r.status));
  }

  console.log("E. Logout");
  {
    let r = await c.submit("/dashboard", {});
    check("logout redirects to /login", r.status === 303 && loc(r.loc) === "/login", `${r.status} ${r.loc}`);
    check("session cookie cleared", !c.hasSession(), [...c.jar.keys()].join(","));
    const log = await mock("/_mock/log");
    check("Supabase /logout called", log.some((l) => l.path === "/auth/v1/logout"));
    r = await c.get("/dashboard"); check("/dashboard blocked after logout", r.status === 307 && loc(r.loc).startsWith("/login"));
  }

  console.log("F. Login failures");
  {
    const c2 = new Client();
    let r = await c2.submit("/login", { email, password: "wrong-password" });
    check("wrong password message", r.text.includes("Invalid email or password."));
    check("no session after failed login", !c2.hasSession());
    r = await c2.submit("/login", { email: "nobody@example.com", password: "whatever12" });
    check("unknown email -> identical message", r.text.includes("Invalid email or password."));
    r = await c2.submit("/login", { email: "", password: "" });
    check("empty fields validated", r.text.includes("Email is required.") && r.text.includes("Password is required."));
    r = await c2.submit("/signup", { email, password: "Another-pass-1", confirmPassword: "Another-pass-1" });
    check("duplicate signup -> generic message", r.text.includes("couldn&#x27;t create that account") || r.text.includes("couldn't create that account"), r.text.slice(0, 0));
    r = await c2.submit("/signup", { email: "weak@example.com", password: "password", confirmPassword: "password" });
    check("weak password message from Supabase", r.text.includes("too weak"));
  }

  console.log("G. Login success + redirect safety");
  {
    const c3 = new Client();
    let r = await c3.submit("/login", { email, password: "Correct-horse-1" });
    check("login redirects to /dashboard", r.status === 303 && loc(r.loc) === "/dashboard", `${r.status} ${r.loc}`);
    check("login sets session", c3.hasSession());
    await c3.submit("/dashboard", {}); // logout
    r = await c3.submit("/login?next=%2Fprofile", { email, password: "Correct-horse-1" });
    check("valid next honored (/profile)", loc(r.loc) === "/profile", r.loc);
    await c3.submit("/dashboard", {});
    for (const evil of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      r = await c3.submit("/login", { email, password: "Correct-horse-1", next: evil });
      check(`open redirect blocked: ${evil}`, loc(r.loc) === "/dashboard", r.loc);
      await c3.submit("/dashboard", {});
    }
  }

  console.log("H. Forgot password");
  const rc = new Client();
  {
    await mock("/_mock/reset", {});
    let r = await rc.submit("/forgot-password", { email: "nobody@example.com" });
    const unknownText = r.text.includes("If an account exists");
    r = await rc.submit("/forgot-password", { email });
    check("same message for known and unknown email (no enumeration)", unknownText && r.text.includes("If an account exists"));
    r = await rc.submit("/forgot-password", { email: "bad" });
    check("invalid email validated", r.text.includes("Enter a valid email address."));
    const log = await mock("/_mock/log");
    const rec = log.filter((l) => l.path === "/auth/v1/recover");
    check("recover called for valid emails only (2 calls)", rec.length === 2, String(rec.length));
    check("recovery redirect_to -> /auth/callback?next=/reset-password", /auth\/callback\?next=\/reset-password/.test(decodeURIComponent(rec[1]?.query.redirect_to || "")), JSON.stringify(rec[1]?.query));
    check("PKCE verifier cookie stored", [...rc.jar.keys()].some((k) => /code-verifier/.test(k)));
  }

  console.log("I. Recovery link -> reset password");
  {
    const { code } = await mock("/_mock/code");
    let r = await rc.get(`/auth/callback?code=${code}&next=/reset-password`);
    check("callback exchanges code and redirects to /reset-password", r.status === 307 && loc(r.loc) === "/reset-password", `${r.status} ${r.loc}`);
    check("recovery session established", rc.hasSession());
    r = await rc.get("/reset-password"); check("/reset-password 200 with session", r.status === 200);
    r = await rc.submit("/reset-password", { password: "NewPassword-2", confirmPassword: "Mismatch-2" });
    check("reset mismatch validated", r.text.includes("Passwords do not match."));
    r = await rc.submit("/reset-password", { password: "short", confirmPassword: "short" });
    check("reset short validated", r.text.includes("at least 8 characters"));
    r = await rc.submit("/reset-password", { password: "Correct-horse-1", confirmPassword: "Correct-horse-1" });
    check("same password rejected", r.text.includes("must be different"));
    r = await rc.submit("/reset-password", { password: "NewPassword-2", confirmPassword: "NewPassword-2" });
    check("password updated -> /dashboard", r.status === 303 && loc(r.loc) === "/dashboard", `${r.status} ${r.loc}`);
    await rc.submit("/dashboard", {}); // logout
    const c4 = new Client();
    r = await c4.submit("/login", { email, password: "Correct-horse-1" });
    check("old password no longer works", r.text.includes("Invalid email or password."));
    r = await c4.submit("/login", { email, password: "NewPassword-2" });
    check("new password works", r.status === 303 && c4.hasSession());
  }

  console.log("J. Callback abuse");
  {
    const c5 = new Client();
    let r = await c5.get("/auth/callback?code=bogus");
    check("bad code -> /login?error=link_invalid", loc(r.loc) === "/login?error=link_invalid", r.loc);
    r = await c5.get("/auth/callback"); check("no params -> link_invalid", loc(r.loc) === "/login?error=link_invalid");
    r = await c5.get("/auth/callback?token_hash=x&type=bogus"); check("bad otp type -> link_invalid", loc(r.loc) === "/login?error=link_invalid");
    r = await c5.get("/login?error=link_invalid"); check("link_invalid message shown", r.text.includes("invalid or has expired"));
    r = await c5.get("/login?error=<script>"); check("arbitrary error param not reflected", !r.text.includes("<script>alert") && !r.text.includes("&lt;script&gt;"));
    // valid code but evil next
    const f = new Client();
    await f.submit("/forgot-password", { email });
    const { code } = await mock("/_mock/code");
    r = await f.get(`/auth/callback?code=${code}&next=https://evil.com`);
    check("callback evil next -> /dashboard", loc(r.loc) === "/dashboard", r.loc);
  }

  console.log("K. Tampered / forged session");
  {
    const c6 = new Client();
    await c6.submit("/login", { email, password: "NewPassword-2" });
    for (const [k, v] of c6.jar) if (/auth-token/.test(k) && !/code-verifier/.test(k)) c6.jar.set(k, v.slice(0, -6) + "AAAAAA");
    let r = await c6.get("/dashboard");
    check("tampered cookie -> redirected to login", r.status === 307 && loc(r.loc).startsWith("/login"), `${r.status} ${r.loc}`);
    const forged = new Client(); forged.jar.set("sb-127-auth-token", "base64-" + Buffer.from(JSON.stringify({ access_token: "a.b.c", refresh_token: "x", user: { email: "x" } })).toString("base64url"));
    r = await forged.get("/dashboard"); check("forged cookie -> redirected to login", r.status === 307 && loc(r.loc).startsWith("/login"), `${r.status}`);
  }

  console.log("L. Roles via profiles.role (mentor/admin)");
  {
    await mock("/_mock/set-role", { email, role: "mentor" });
    const m = new Client(); await m.submit("/login", { email, password: "NewPassword-2" });
    let r = await m.get("/mentor/dashboard"); check("mentor /mentor/dashboard allowed", r.status !== 307, String(r.status));
    r = await m.get("/admin"); check("mentor /admin -> /dashboard", loc(r.loc) === "/dashboard");
    r = await m.get("/dashboard"); check("mentor /dashboard -> /mentor/dashboard", r.status === 307 && loc(r.loc) === "/mentor/dashboard", `${r.status} ${r.loc}`);
    await mock("/_mock/set-role", { email, role: "admin" });
    const a = new Client(); await a.submit("/login", { email, password: "NewPassword-2" });
    r = await a.get("/admin"); check("admin /admin allowed", r.status !== 307, String(r.status));
    r = await a.get("/admin/users"); check("admin /admin/users allowed", r.status !== 307, String(r.status));
    await mock("/_mock/set-role", { email, role: "superuser" });
    const s = new Client(); await s.submit("/login", { email, password: "NewPassword-2" });
    r = await s.get("/admin"); check("unknown profiles.role value falls back to student", loc(r.loc) === "/dashboard");
  }

  console.log("L2. Module 03: role source is profiles.role ONLY (never JWT/app_metadata/user_metadata)");
  {
    await mock("/_mock/set-role", { email, role: "student" });
    await mock("/_mock/set-app-role", { email, role: "admin" }); // attacker-style: role in JWT app_metadata
    const x = new Client(); await x.submit("/login", { email, password: "NewPassword-2" });
    let r = await x.get("/admin"); check("app_metadata admin NO LONGER grants /admin", loc(r.loc) === "/dashboard", `${r.status} ${r.loc}`);
    r = await x.get("/mentor/dashboard"); check("app_metadata admin NO LONGER grants /mentor/*", loc(r.loc) === "/dashboard");
    r = await x.get("/dashboard"); check("dashboard role comes from profiles (student)", /Role:[^<]*(<!--.*?-->)?\s*student/.test(r.text));
    await mock("/_mock/set-app-role", { email, role: "mentor" });
    await mock("/_mock/set-role", { email, role: "admin" });   // profiles says admin, JWT says mentor
    const y = new Client(); await y.submit("/login", { email, password: "NewPassword-2" });
    r = await y.get("/admin"); check("profiles.role admin wins over JWT app_metadata", r.status !== 307, String(r.status));
    // missing profile -> least privilege
    await mock("/_mock/drop-profile", { email });
    const z = new Client(); await z.submit("/login", { email, password: "NewPassword-2" });
    r = await z.get("/admin"); check("missing profile row -> denied /admin (fail closed)", loc(r.loc) === "/dashboard", `${r.status} ${r.loc}`);
    r = await z.get("/dashboard"); check("missing profile row -> still signed in as student", r.status === 200 && /Role:[^<]*(<!--.*?-->)?\s*student/.test(r.text), String(r.status));
    // failing lookup -> fail closed on restricted paths
    await mock("/_mock/set-role", { email, role: "admin" });
    await mock("/_mock/profiles-fail", { fail: true });
    const w = new Client(); await w.submit("/login", { email, password: "NewPassword-2" });
    r = await w.get("/admin"); check("profiles lookup error -> /admin denied (fail closed)", loc(r.loc) === "/dashboard", `${r.status} ${r.loc}`);
    r = await w.get("/dashboard"); check("profiles lookup error -> /dashboard not broken", r.status === 200, String(r.status));
    r = await w.get("/mentor/apply"); check("/mentor/apply (any signed-in role) unaffected by lookup error", r.status !== 307, String(r.status));
    await mock("/_mock/profiles-fail", { fail: false });
    const log = await mock("/_mock/log");
    check("profiles lookups carried the user's JWT, never a service key", !JSON.stringify(log).includes("service_role"));
  }

  console.log("L3. Module 05: student profile page + server action (mock REST, not real RLS)");
  {
    const ea = "profile-a@example.com", eb = "profile-b@example.com", pw = "Correct-horse-1";
    await mock("/_mock/reset", {});
    const A = new Client(), B = new Client();
    await A.submit("/signup", { email: ea, password: pw, confirmPassword: pw });
    await B.submit("/signup", { email: eb, password: pw, confirmPassword: pw });
    const dbB = await mock("/_mock/db", { email: eb });

    let r = await A.get("/profile");
    check("student /profile renders", r.status === 200 && r.text.includes("My profile") && r.text.includes("Personal information"), String(r.status));
    check("empty education state shown", r.text.includes("No education records yet. Add your education history"));
    check("empty experience state shown", r.text.includes("No experience added yet"));
    check("completion indicator shown (0%)", r.text.includes("Profile completeness: ") && r.text.includes("0%"));
    check("header links to /profile when signed in", /href="\/profile"/.test(r.text));
    r = await A.get("/dashboard"); check("dashboard links to /profile", /href="\/profile"/.test(r.text));

    await mock("/_mock/reset", {});
    r = await A.submit("/profile", { full_name: "   " });
    check("blank full_name rejected server-side", r.text.includes("Full name is required."));
    r = await A.submit("/profile", { full_name: "x".repeat(201) });
    check("overlong full_name rejected server-side", r.text.includes("Full name must be at most 200 characters."));
    r = await A.submit("/profile", { full_name: "Ok Name", city: "bad\u0001city" });
    check("control characters rejected", r.text.includes("City contains invalid characters."));
    let log = await mock("/_mock/log");
    check("invalid input never reached the database", !log.some((l) => l.path === "/rest/v1/profiles" && l.method === "PATCH"));

    // Tamper: try to smuggle role / ownership fields through the form. They must be ignored.
    r = await A.submit("/profile", { full_name: "Alice Student", nationality: "Pakistani", city: "Lahore", role: "admin", user_id: dbB.profileId, profile_id: dbB.profileId, id: dbB.profileId });
    log = await mock("/_mock/log");
    const patch = log.find((l) => l.path === "/rest/v1/profiles" && l.method === "PATCH");
    check("profile update sent only whitelisted columns", patch && Object.keys(patch.body).sort().join() === "city,full_name,nationality", JSON.stringify(patch?.body));
    const dbA = await mock("/_mock/db", { email: ea });
    check("profile update targets the session user, not a browser-supplied id", patch && patch.query.user_id === "eq." + dbA.userId, JSON.stringify(patch?.query));
    check("profile saved", dbA.profile.full_name === "Alice Student" && dbA.profile.city === "Lahore", JSON.stringify(dbA.profile));
    check("role unchanged after tampered submit", dbA.role === "student");
    check("other user's profile untouched", (await mock("/_mock/db", { email: eb })).profile.full_name === null);
    r = await A.get("/profile");
    check("saved values displayed", r.text.includes("Alice Student") && r.text.includes("Lahore"));
    check("completion updated (60%)", r.text.includes("60%"));

    r = await B.get("/profile");
    check("user B does not see user A's data", !r.text.includes("Alice Student"));

    await mock("/_mock/rest-fail", { fail: true });
    r = await A.get("/profile");
    check("database failure -> generic message, 200, no leak", r.status === 200 && r.text.includes("temporarily unavailable") && !r.text.includes("XX000") && !r.text.includes("mock:"), String(r.status));
    await mock("/_mock/rest-fail", { fail: false });
    log = await mock("/_mock/log");
    check("profile requests carried user JWT only (no service role)", !JSON.stringify(log).includes("service_role"));
    r = await new Client().get("/profile");
    check("guest /profile -> /login", r.status === 307 && loc(r.loc).startsWith("/login"));
  }
  console.log("L4. Module 09: /matches (mock REST + mock public scholarships; NOT real RLS, NOT live Supabase)");
  {
    const pw = "Correct-horse-1";
    const mk = async (email) => { const c = new Client(); await c.submit("/signup", { email, password: pw, confirmPassword: pw }); return c; };
    const edu = (o) => ({ level: "bachelor", field: "Computer Science", cgpa: 3.6, cgpa_scale: 4, start_date: "2020-09-01", expected_graduation: "2024-06-30", ...o });
    const S = (id, name, o = {}) => ({ id, name, provider: "Provider " + name, status: "active", degree_level: "Master's", field: "Computer Science", funding_type: "fully_funded", deadline: "2027-03-01", ...o });
    const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const seed = [
      S(U(1), "Alpha CS Masters", { minimum_gpa: 3.0, minimum_gpa_scale: 4 }),
      S(U(2), "Beta Medicine Masters", { field: "Medicine" }),
      S(U(3), "Secret Draft Scholarship", { status: "draft" }),
      S(U(4), "Secret Archived Scholarship", { status: "archived" }),
      S(U(5), "Gamma Closed Scholarship", { deadline: "2026-09-01" }),
      S(U(6), "Delta No Deadline Scholarship", { deadline: null }),
      S(U(7), "Epsilon Strict GPA Scholarship", { minimum_gpa: 3.9, minimum_gpa_scale: 4 }),
      S(U(8), "Zeta Needs Confirmation", { requirements: [{ title: "Two recommendation letters", required: true }] }),
    ];
    await mock("/_mock/set-scholarships", seed);
    const ea = "match-a@example.com", eb = "match-b@example.com", ec = "match-c@example.com", ed = "match-d@example.com";
    const A = await mk(ea), B = await mk(eb), C = await mk(ec), D = await mk(ed);
    await mock("/_mock/set-education", { email: ea, education: [edu({})] });
    await mock("/_mock/set-education", { email: eb, education: [edu({ field: "Medicine", cgpa: 2.1 })] });
    await mock("/_mock/set-education", { email: ed, education: [edu({ field: null, cgpa: null, cgpa_scale: null, expected_graduation: null })] });
    const dbA = await mock("/_mock/db", { email: ea }), dbB = await mock("/_mock/db", { email: eb });

    await mock("/_mock/reset", {});
    let r = await A.get("/matches");
    check("student /matches renders", r.status === 200 && r.text.includes("My scholarship matches"), String(r.status));
    check("relevant scholarship shown with eligibility status", r.text.includes("Alpha CS Masters") && r.text.includes('data-decision="eligible"'));
    check("explanation: degree level + GPA + field reasons shown", r.text.includes("Why it matched") && r.text.includes("Minimum GPA") && r.text.includes("3.6/4"));
    check("unrelated-field scholarship NOT shown by default", !r.text.includes("Beta Medicine Masters"));
    check("hidden-count option offered", r.text.includes("more in other fields or levels"));
    check("draft + archived never shown", !r.text.includes("Secret Draft") && !r.text.includes("Secret Archived"));
    check("closed scholarship hidden by default, option offered", !r.text.includes("Gamma Closed") && r.text.includes("Include closed scholarships"));
    check("no-deadline scholarship shown and labelled", r.text.includes("Delta No Deadline") && r.text.includes("Deadline not listed"));
    check("below-minimum-GPA scholarship shown as Not eligible with reason", r.text.includes("Epsilon Strict GPA") && r.text.includes('data-decision="not_eligible"') && r.text.includes("is below the minimum"));
    check("requirement text rows are 'needs your confirmation', never auto-met", r.text.includes("Zeta Needs Confirmation") && r.text.includes('data-decision="unknown"') && r.text.includes("Two recommendation letters"));
    check("details link to the public scholarship page", r.text.includes(`href="/scholarships/${U(1)}"`));
    check("no probability / score language", !/probability|chance of|% match|match score/i.test(r.text));
    check("order: eligible before unresolved before not eligible", r.text.indexOf("Alpha CS Masters") < r.text.indexOf("Zeta Needs Confirmation") && r.text.indexOf("Zeta Needs Confirmation") < r.text.indexOf("Epsilon Strict GPA"));
    check("header + dashboard link to /matches", /href="\/matches"/.test(r.text) && /href="\/matches"/.test((await A.get("/dashboard")).text));
    check("profile complete -> no completion warning", !r.text.includes("Complete your profile for more accurate matches"));

    let log = await mock("/_mock/log");
    const sch = log.filter((l) => l.path === "/rest/v1/scholarships");
    check("exactly ONE scholarships query (requirements embedded, no N+1)", sch.length === 1 && !log.some((l) => l.path === "/rest/v1/scholarship_requirements"), String(sch.length));
    check("scholarships read with the anon client (no user JWT)", sch.every((l) => l.userJwt === false));
    check("scholarships query selects explicit columns and is bounded", sch[0] && !sch[0].query.select.includes("*") && Number(sch[0].query.limit) > 0 && Number(sch[0].query.limit) <= 501, JSON.stringify(sch[0]?.query));
    check("closed scholarships filtered in SQL by default", sch[0] && /deadline\.gte\./.test(sch[0].query.or || ""));
    const profReq = log.filter((l) => l.path === "/rest/v1/profiles" && l.method === "GET" && l.query.select && l.query.select.includes("full_name"));
    check("own profile loaded by the SESSION user id", profReq.length >= 1 && profReq.every((l) => l.query.user_id === "eq." + dbA.userId), JSON.stringify(profReq.map((l) => l.query)));
    check("no service-role credentials used", !JSON.stringify(log).includes("service_role"));

    r = await A.get("/matches?closed=1&show=all");
    check("?closed=1 includes the closed scholarship, labelled", r.text.includes("Gamma Closed") && r.text.includes("Deadline passed"));
    check("?show=all includes other-field scholarship", r.text.includes("Beta Medicine Masters"));
    check("closed one sorts after open ones in its tier", r.text.indexOf("Delta No Deadline") < r.text.indexOf("Gamma Closed"));
    check("draft/archived still hidden with every option on", !r.text.includes("Secret Draft") && !r.text.includes("Secret Archived"));

    // Defence in depth: even if RLS were broken and the API returned drafts/archived, the app excludes them.
    await mock("/_mock/leak-nonactive", { on: true });
    r = await A.get("/matches?closed=1&show=all");
    check("app excludes non-active rows even if the API leaked them", !r.text.includes("Secret Draft") && !r.text.includes("Secret Archived") && r.text.includes("Alpha CS Masters"));
    await mock("/_mock/leak-nonactive", { on: false });

    // Forged identity: the page ignores user_id / profile_id / email parameters.
    const plain = await A.get("/matches");
    await mock("/_mock/reset", {});
    r = await A.get(`/matches?user_id=${dbB.userId}&profile_id=${dbB.profileId}&email=${eb}`);
    check("forged user/profile id params change nothing", r.status === 200 && r.text === plain.text || (r.text.includes("Alpha CS Masters") && !r.text.includes("2.1/4")));
    log = await mock("/_mock/log");
    check("forged ids never sent to the database", !JSON.stringify(log).includes(dbB.userId) && !JSON.stringify(log).includes(dbB.profileId));

    // User B sees only their own data.
    r = await B.get("/matches?show=all");
    check("B sees B's own profile data (2.1/4 vs 3.0 min), not A's 3.6/4", r.text.includes("Alpha CS Masters") && r.text.includes("2.1/4") && !r.text.includes("3.6/4"));
    r = await A.get("/matches");
    check("A's page has none of B's data", !r.text.includes("2.1/4"));

    // Incomplete profile states.
    await mock("/_mock/reset", {});
    r = await C.get("/matches");
    check("no education -> add-education state, no scholarship list", r.status === 200 && r.text.includes("Add your education to see matches") && !r.text.includes("Alpha CS Masters") && /href="\/profile#education"/.test(r.text));
    log = await mock("/_mock/log");
    check("no scholarships query when the profile cannot be matched yet", !log.some((l) => l.path === "/rest/v1/scholarships"));
    r = await D.get("/matches");
    check("partial profile -> completion guidance + results still shown", r.text.includes("Complete your profile for more accurate matches") && r.text.includes("CGPA and CGPA scale") && r.text.includes("Alpha CS Masters"));
    check("missing info is never treated as ineligible or eligible (needs information)", r.text.includes('data-decision="needs_information"') && !r.text.includes('data-decision="not_eligible"') && !r.text.includes('data-decision="eligible"'), "");
    check("missing-info link points to the education section", /href="\/profile#education"/.test(r.text));

    // Empty datasets + failures + pagination.
    await mock("/_mock/set-scholarships", []);
    r = await A.get("/matches");
    check("no published scholarships -> empty state, no crash", r.status === 200 && r.text.includes("No matching scholarships right now") && r.text.includes("no published scholarships yet"));
    await mock("/_mock/set-scholarships", Array.from({ length: 30 }, (_, i) => S(U(100 + i), `Bulk Scholarship ${String(i).padStart(2, "0")}`, { deadline: `2027-0${1 + (i % 9)}-15` })));
    r = await A.get("/matches");
    const n1 = (r.text.match(/Bulk Scholarship \d\d/g) || []).filter((v, i, a) => a.indexOf(v) === i).length;
    const flat = (t) => t.replace(/<!-- -->/g, ""); // React inserts comment nodes between adjacent text/expressions
    check("page 1 shows 12 results of 30", n1 === 12 && flat(r.text).includes("of 30 scholarships") && flat(r.text).includes("Page 1 of 3"), String(n1));
    r = await A.get("/matches?page=3");
    check("last page shows the remainder", (r.text.match(/Bulk Scholarship \d\d/g) || []).filter((v, i, a) => a.indexOf(v) === i).length === 6);
    r = await A.get("/matches?page=99999&show=zzz&closed=abc");
    check("absurd / unknown params handled safely", r.status === 200 && flat(r.text).includes("Page 3 of 3"));
    await mock("/_mock/set-scholarships", seed);
    await mock("/_mock/rest-fail", { fail: true });
    r = await A.get("/matches");
    check("database failure -> generic message, 200, no leak", r.status === 200 && r.text.includes("temporarily unavailable") && !r.text.includes("XX000") && !r.text.includes("mock:"), String(r.status));
    await mock("/_mock/rest-fail", { fail: false });
    r = await new Client().get("/matches");
    check("guest /matches -> /login?next=/matches", r.status === 307 && loc(r.loc) === "/login?next=%2Fmatches", `${r.status} ${r.loc}`);
  }
}

if (PHASE === "confirm") {
  console.log("M. Signup with email confirmation required");
  const email = "confirm@example.com";
  const c = new Client();
  let r = await c.submit("/signup", { email, password: "Correct-horse-1", confirmPassword: "Correct-horse-1" });
  check("shows check-your-email message", r.status === 200 && r.text.includes("Check your email"), String(r.status));
  check("no session before confirmation", !c.hasSession());
  r = await c.get("/dashboard"); check("/dashboard blocked", r.status === 307);
  r = await c.submit("/login", { email, password: "Correct-horse-1" });
  check("login before confirmation -> confirm message", r.text.includes("confirm your email"));
  await mock("/_mock/confirm", { email });
  r = await c.submit("/login", { email, password: "Correct-horse-1" });
  check("login after confirmation works", r.status === 303 && loc(r.loc) === "/dashboard");
}

if (PHASE === "refresh") {
  console.log("N. Session refresh in proxy (short-lived access token)");
  const email = "refresh@example.com";
  const c = new Client();
  await c.submit("/signup", { email, password: "Correct-horse-1", confirmPassword: "Correct-horse-1" });
  await mock("/_mock/reset", {});
  const before = JSON.stringify([...c.jar]);
  let r = await c.get("/dashboard");
  const log = await mock("/_mock/log");
  check("dashboard still 200", r.status === 200, String(r.status));
  check("refresh_token grant performed", log.some((l) => l.path === "/auth/v1/token" && l.query.grant_type === "refresh_token"));
  check("cookies rotated", JSON.stringify([...c.jar]) !== before);
  check("response is not cacheable", /no-store|private|no-cache/.test(r.res.headers.get("cache-control") || ""), r.res.headers.get("cache-control"));
}

if (PHASE === "unconfigured") {
  console.log("O. App running with NO Supabase env (fail closed)");
  const c = new Client();
  let r = await c.get("/dashboard"); check("/dashboard -> /login", r.status === 307 && loc(r.loc).startsWith("/login"), `${r.status}`);
  r = await c.get("/"); check("home still renders", r.status === 200 && r.text.includes("Log in"));
  r = await c.submit("/login", { email: "a@example.com", password: "whatever12" });
  check("login shows not-configured message (no crash)", r.status === 200 && r.text.includes("not configured"), `${r.status}`);
  r = await c.submit("/signup", { email: "a@example.com", password: "Correct-horse-1", confirmPassword: "Correct-horse-1" });
  check("signup shows not-configured message", r.text.includes("not configured"));
  r = await c.submit("/forgot-password", { email: "a@example.com" });
  check("forgot-password shows not-configured message", r.text.includes("not configured"));
  r = await c.get("/reset-password"); check("/reset-password -> forgot-password", r.status === 307);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
