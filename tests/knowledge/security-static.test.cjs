// Static checks for Module 11 (source/SQL text only; NOT runtime proof). Runtime behaviour is covered by
// knowledge.test.cjs (mocks) and tests/db/rls.test.sql (needs Postgres + pgvector).
const fs = require("node:fs"); const path = require("node:path"); const crypto = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/--.*$/gm, "");

const kdir = "src/lib/knowledge";
const files = fs.readdirSync(path.join(root, kdir)).map((f) => [f, read(`${kdir}/${f}`)]);
const pure = files.filter(([f]) => !f.endsWith(".server.ts"));
const serverFiles = files.filter(([f]) => f.endsWith(".server.ts"));
const sql = strip(read("supabase/migrations/20261002000100_rag_knowledge_base.sql")).toLowerCase();
const route = read("src/app/api/admin/knowledge/ingest/route.ts");

t("applied migrations 01–04 are byte-identical to what was approved (never edit applied migrations)", () => {
  const pins = { "20261001000100_profiles_and_roles.sql": "521d066cad4ab3d489d643eaf47d412d5ae174059b822a5ae55af4102cb7914f", "20261001000200_core_tables.sql": "91534a31e72045137fe7f8b0c6cdb58f57a58466600713147bb2b3c6e07035fd",
    "20261001000300_rls_policies.sql": "413f807a80b77488380b81ba56fa2150956a3f4e70d496ac4fc76acbd795392f", "20261001000400_storage_documents.sql": "c993edab6b295a97f0223933aba2de96d0ac5f615976225a8565425406bfe9af" };
  for (const [f, h] of Object.entries(pins)) ok(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "supabase/migrations", f))).digest("hex") === h, `${f} was modified`);
});
t("Module 11 migration: RLS enabled on both new tables; revoke-all before grants", () => {
  for (const tb of ["knowledge_documents", "knowledge_chunks"]) ok(new RegExp(`alter table public\\.${tb}\\s+enable row level security`).test(sql), `RLS missing on ${tb}`);
  ok(/revoke all on table public\.knowledge_documents, public\.knowledge_chunks from public, anon, authenticated/.test(sql), "revoke missing");
});
t("migration: no grant to anon; authenticated gets SELECT only; writes only to service_role", () => {
  ok(!/grant[^;]*\bto[^;]*\banon\b/.test(sql.replace(/revoke[^;]*;/g, "")), "grant to anon");
  const grants = [...sql.matchAll(/grant ([^;]*?) on (?:table )?public\.knowledge_[a-z_, .]*to ([^;]*);/g)];
  ok(grants.length >= 2, "grants not found");
  for (const [, priv, to] of grants) { if (/authenticated/.test(to)) ok(/^select$/.test(priv.trim()), `authenticated granted: ${priv}`); }
  ok(/grant select, insert, update, delete on public\.knowledge_documents, public\.knowledge_chunks to service_role/.test(sql), "service_role grant missing");
});
t("migration: authenticated read is admin-only via is_admin() (no permissive policy for students/anon)", () => {
  const pol = [...sql.matchAll(/create policy [a-z_]+ on public\.knowledge_[a-z]+ for ([a-z]+) to ([a-z, ]+)\s+using \(([^;]*)\);/g)];
  ok(pol.length === 2, `expected 2 policies, found ${pol.length}`);
  for (const [, cmd, to, using] of pol) ok(cmd === "select" && to.trim() === "authenticated" && /public\.is_admin\(\)/.test(using), "policy is not admin-only select");
});
t("migration: match function is SECURITY INVOKER, service_role only, and enforces visibility itself", () => {
  const fn = sql.slice(sql.indexOf("create or replace function public.match_knowledge_chunks"));
  ok(/security invoker/.test(fn) && !/security definer/.test(fn), "not invoker");
  ok(/revoke all on function public\.match_knowledge_chunks[^;]*from public, anon, authenticated/.test(fn), "revoke missing");
  ok(/grant execute on function public\.match_knowledge_chunks[^;]*to service_role;/.test(fn) && !/grant execute[^;]*(anon|authenticated)/.test(fn), "grant wrong");
  for (const cond of ["d.active", "d.processing_status = 'ready'", "s.active", "s.last_verified_at is not null", "sc.status = 'active'"]) ok(fn.includes(cond), `visibility condition missing: ${cond}`);
  ok(/limit greatest\(1, least\(/.test(fn), "result limit not clamped");
});
t("migration: fixed 768-dim vector, cosine HNSW index, error_code constrained, no ALTER/DROP of earlier tables", () => {
  ok(/extensions\.vector\(768\)/.test(sql) && /hnsw \(embedding extensions\.vector_cosine_ops\)/.test(sql), "vector/index");
  ok(/error_code ~ '\^\[a-z0-9_\]\{1,64\}\$'/.test(sql), "error_code not constrained");
  ok(!/\bdrop\s+(table|policy|function)|alter table public\.(profiles|scholarships|scholarship_sources|scholarship_requirements|documents|applications|mentors)/.test(sql), "touches earlier objects");
});

t("pure knowledge modules never import Supabase/env/server-only and never read process.env (they stay testable and secret-free)", () => {
  for (const [f, s] of pure) { const c = strip(s); ok(!/supabase|env\.server|server-only|process\.env|SERVICE_ROLE|GEMINI|createAdminClient/.test(c), `${f}: forbidden reference`); }
});
t("server-only modules import 'server-only'", () => { ok(serverFiles.length === 2, "expected store + service"); for (const [f, s] of serverFiles) ok(/^import "server-only";/m.test(s), `${f} missing server-only`); });
t("service role is used only by the knowledge store; the Gemini key only by service.server.ts (via getAiKeys)", () => {
  ok(/createAdminClient/.test(read(`${kdir}/store.server.ts`)), "store should use the admin client");
  for (const [f, s] of files) { if (f !== "store.server.ts") ok(!/createAdminClient|supabase\/admin/.test(strip(s)), `${f} uses the admin client`); if (f !== "service.server.ts") ok(!/getAiKeys|GEMINI_API_KEY/.test(strip(s)), `${f} reads AI keys`); }
});
t("nothing outside the admin route imports the knowledge server modules (no client/public/UI code can reach them)", () => {
  const offenders = [...walk("src/app"), ...walk("src/components"), ...walk("src/lib")].filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith(kdir) && !f.includes("api/admin/knowledge/ingest/route.ts"))
    .filter((f) => /lib\/knowledge|\.\.?\/knowledge/.test(read(f)))
    // Module 12 allow-list (ADR-034): exactly one server-only file may call retrieve(); the pure assistant files may only
    // `import type` from ../knowledge/retrieve. Any other importer (client/UI/public code) still fails.
    .filter((f) => {
      const norm = f.split(path.sep).join("/"), src = read(f);
      if (norm === "src/lib/assistant/service.server.ts") return !/^import "server-only";/.test(src.trim());
      if (/^src\/lib\/assistant\/(answer|prompt)\.ts$/.test(norm)) {
        const lines = src.split("\n").filter((l) => /knowledge/.test(l) && /^\s*import\b/.test(l));
        // Pure helpers/types from retrieve only (no service.server / store.server).
        return !(lines.length > 0 && lines.every((l) => /from "\.\.\/knowledge\/retrieve";\s*$/.test(l.trim()) && !/service\.server|store\.server/.test(l)));
      }
      // Module 13 allow-list (ADR-035): the agent's server-only service may call retrieve(); executors may import
      // pure helpers/types from ../knowledge/retrieve (not service.server / store.server).
      if (norm === "src/lib/agent/service.server.ts") return !/^import "server-only";/.test(src.trim());
      if (norm === "src/lib/agent/executors.server.ts") {
        const lines = src.split("\n").filter((l) => /knowledge/.test(l) && /^\s*import\b/.test(l));
        return !(/^import "server-only";/.test(src.trim()) && lines.length > 0 && lines.every((l) => /from "\.\.\/knowledge\/retrieve";\s*$/.test(l.trim()) && !/service\.server|store\.server/.test(l)));
      }
      return true;
    });
  ok(offenders.length === 0, `imported from: ${offenders.join(", ")}`);
  ok(!walk("src/components").some((f) => /knowledge/i.test(f)) && !walk("src/app").some((f) => /knowledge/i.test(f) && !f.includes("api/admin/knowledge")), "unexpected UI for Module 11 (backend-only scope)");
});
t("embedding key: only in the x-goog-api-key header; never in URLs, logs or thrown/returned errors", () => {
  const e = strip(read(`${kdir}/embeddings.ts`));
  ok(/"x-goog-api-key": this\.apiKey/.test(e) && !/[?&]key=/.test(e) && !/\$\{[^}]*apiKey/.test(e), "key usage");
  for (const [f, s] of files) ok(!/console\.log\(/.test(strip(s)), `${f}: console.log`);
  const store = strip(read(`${kdir}/store.server.ts`)); ok(!/console\.error\([^)]*(error\.message|\.message|JSON\.stringify)/.test(store) && /error\?\.code|e\?\.code/.test(store), "store logs more than error codes");
});
t("fetch layer: manual redirects, every hop re-validated, no credentials/cookies, bounded size and time", () => {
  const f = strip(read(`${kdir}/fetch.ts`));
  ok(/redirect: "manual"/.test(f) && /assertPublicUrl\(current/.test(f) && /for \(let hop = 0; hop <= cfg\.maxRedirects/.test(f), "redirect handling");
  ok(!/credentials|cookie|authorization/i.test(f), "credentials"); ok(/maxResponseBytes/.test(f) && /AbortController/.test(f) && /allowedContentTypes/.test(f), "limits");
});
t("PDF is explicitly unsupported (no silent acceptance) and the content-type allow-list is text only", () => {
  const c = strip(read(`${kdir}/config.ts`)); const m = /allowedContentTypes: \[([^\]]*)\]/.exec(c); ok(m && !/pdf/.test(m[1]) && /text\/html/.test(m[1]), "allow-list");
});
t("admin route: admin-only (401/403), JSON-only, same-origin, no caller-supplied URL, no content/errors in responses", () => {
  const r = strip(route);
  ok(/getCurrentUser\(\)/.test(r) && /current\.role !== "admin"/.test(r) && /401/.test(r) && /403/.test(r), "authz");
  ok(/application\/json/.test(r) && /origin/.test(r) && /415/.test(r), "csrf/content-type");
  ok(!/b\.url|body\.url|\.sourceUrl|source_url/.test(r), "caller-supplied URL"); ok(!/error\.message|\.stack|err\.message/.test(r), "raw error leaked");
  ok(/export const runtime = "nodejs"/.test(r), "node runtime (dns/net) required");
  ok(!/export (async )?function (GET|PUT|PATCH|DELETE)/.test(r), "only POST is exposed");
});
t("authorization precedes any body parsing or ingestion in the route", () => {
  const r = strip(route); ok(r.indexOf("current.role") < r.indexOf("request.json()") && r.indexOf("request.json()") < r.indexOf("ingestSourceById("), "order");
});
t("retrieval output never claims 'official'/'verified' and similarity is documented as not a probability", () => {
  const r = read(`${kdir}/retrieve.ts`); ok(!/isOfficial|official:|verified:\s*true|confidence|probabilit(y|ies):/.test(strip(r)), "unwarranted claim field");
  ok(/NOT a probability/.test(r), "similarity caveat missing");
});
t("public scholarship pages/queries do not reference the knowledge base (public access unchanged)", () => {
  for (const f of walk("src/lib/public")) ok(!/knowledge/i.test(read(f)), f);
  for (const f of ["src/lib/matching/queries.ts", "src/app/scholarships/[id]/page.tsx"]) ok(!/knowledge/i.test(read(f)), f);
});
t(".env.example: Gemini key is server-only (no NEXT_PUBLIC variant anywhere)", () => {
  ok(!/NEXT_PUBLIC_[A-Z_]*(GEMINI|GROK|OPENAI|EMBEDDING)/.test(read(".env.example")), "public AI key"); ok(/^GEMINI_API_KEY=/m.test(read(".env.example")), "GEMINI_API_KEY missing");
  for (const f of walk("src")) ok(!/NEXT_PUBLIC_[A-Z_]*(GEMINI|GROK)/.test(read(f)), f);
});


t("Repair Session 7: match_knowledge_chunks returns sc.id as scholarship_id (not nullable document snapshot)", () => {
  const fix = strip(read("supabase/migrations/20261003000200_match_knowledge_scholarship_id.sql")).toLowerCase();
  ok(/create or replace function public\.match_knowledge_chunks/.test(fix));
  ok(/sc\.id/.test(fix) && /filter_scholarship_id is null or sc\.id = filter_scholarship_id/.test(fix));
  ok(/grant execute on function public\.match_knowledge_chunks[^;]*to service_role/.test(fix));
  ok(!/grant execute[^;]*(anon|authenticated)/.test(fix));
});

console.log(`\nknowledge static checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
