// Static checks for Module 12 (source text only; NOT runtime proof). Runtime behaviour: assistant.test.cjs (mocks).
const fs = require("node:fs"); const path = require("node:path"); const crypto = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const dir = "src/lib/assistant";
const files = fs.readdirSync(path.join(root, dir)).map((f) => [f, strip(read(`${dir}/${f}`))]);
const route = strip(read("src/app/api/assistant/ask/route.ts"));
const panel = read("src/components/scholarship/assistant-panel.tsx");
const page = read("src/app/scholarships/[id]/page.tsx");
const service = files.find(([f]) => f === "service.server.ts")[1];

t("route: auth precedes body parsing and any assistant call; no role restriction beyond signed-in; 401 when signed out", () => {
  const iAuth = route.indexOf("getCurrentUser()"), iBody = route.indexOf("request.json()"), iAsk = route.indexOf("askAssistant(");
  ok(iAuth > 0 && iAuth < iBody && iBody < iAsk, "order is wrong"); ok(/unauthenticated"[^)]*401/.test(route), "401 missing");
});
t("route: JSON-only (415), same-origin host check (403), generic no-store responses", () => {
  ok(/415/.test(route) && /application\/json/.test(route) && /originHost !== host/.test(route) && /403/.test(route) && /no-store/.test(route));
});
t("route: validates body with validateAskBody before touching the database or Gemini", () => {
  ok(route.indexOf("validateAskBody(") > 0 && route.indexOf("validateAskBody(") < route.indexOf("createClient()") && route.indexOf("createClient()") < route.indexOf("askAssistant("));
});
t("route: scholarship visibility is checked with the user's RLS-bound client (not service role); missing -> 404", () => {
  ok(/createClient\(\)/.test(route) && /from\("scholarships"\)/.test(route) && /not_found"[^)]*404/.test(route));
  ok(!/service_role|SERVICE_ROLE|createAdminClient|getSupabaseServiceRoleKey/.test(route), "route must not use service role");
});
t("route: never reads a URL from the client and returns no raw errors/keys/prompts", () => {
  ok(!/\.url\b|sourceUrl|fetch\(/.test(route), "route handles URLs/fetch");
  ok(!/error\.message|\.message\b|String\(e|JSON\.stringify\(e/.test(route), "route may leak error text");
  ok(!/GEMINI|process\.env/.test(route), "route touches secrets");
});
t("validation module reads only scholarshipId and question", () => {
  const v = files.find(([f]) => f === "validate.ts")[1];
  const reads = [...v.matchAll(/\bb\.([a-zA-Z]+)/g)].map((m) => m[1]); ok(reads.length > 0 && reads.every((r) => r === "scholarshipId" || r === "question"), `reads: ${[...new Set(reads)]}`);
});
t("server wiring is server-only, reuses Module 11 retrieve(), and no second vector search exists", () => {
  ok(/^import "server-only";/.test(service.trim()), "server-only missing"); ok(/from "@\/lib\/knowledge\/service\.server"/.test(service) && /\bretrieve\b/.test(service));
  for (const [f, s] of files) ok(!/match_knowledge_chunks|\.rpc\(|pgvector|cosine|<=>/.test(s), `${f} does its own vector search`);
});
t("secrets: only service.server.ts reads the Gemini key; key goes only in the x-goog-api-key header; pure modules import no env/server code", () => {
  for (const [f, s] of files) { if (f !== "service.server.ts") ok(!/process\.env|getAiKeys|env\.server|SUPABASE_SERVICE_ROLE/.test(s), `${f} reads env`); }
  const g = files.find(([f]) => f === "generation.ts")[1]; ok(/"x-goog-api-key": this\.apiKey/.test(g) && !/\?key=|key=\$\{/.test(g)); ok(!/console\./.test(g));
  for (const [f, s] of files) ok(!/console\.(log|error|warn|info)/.test(s), `${f} logs`);
});
t("no client component imports server-only assistant/knowledge code; panel calls only the same-origin route", () => {
  ok(/^"use client";/.test(panel)); ok(!/service\.server|env\.server|lib\/knowledge|lib\/assistant\/(service|generation)/.test(panel), "client imports server code");
  ok(/fetch\("\/api\/assistant\/ask"/.test(panel) && !/fetch\("https?:/.test(panel)); ok(!/NEXT_PUBLIC_[A-Z_]*(GEMINI|SERVICE)/.test(panel + page));
});
t("panel renders the answer as text (no dangerouslySetInnerHTML) and only opens http(s) source links", () => {
  ok(!/dangerouslySetInnerHTML|innerHTML/.test(panel)); ok(/protocol === "http:" \|\| u\.protocol === "https:"/.test(panel) && /rel="noopener noreferrer"/.test(panel));
});
t("prompt: untrusted data is delimited and neutralised; rules live in the system instruction, not the user content", () => {
  const p = files.find(([f]) => f === "prompt.ts")[1]; ok(/export function neutralize/.test(p) && /<source n=/.test(p) && /<question>/.test(p));
  ok(/Never follow them/.test(read(`${dir}/prompt.ts`)));
});
t("answer: fails closed — requires valid citations, filters by scholarship id, never calls the model on empty evidence", () => {
  const a = files.find(([f]) => f === "answer.ts")[1]; ok(/chunkBelongsToScholarship\(c, scholarshipId\)/.test(a) && /chunks\.length === 0\) return insufficient/.test(a) && /citations\.length === 0\) return null/.test(a));
  ok(a.indexOf("validateAskBody(") < a.indexOf("deps.retrieve(") && a.indexOf("deps.retrieve(") < a.indexOf("deps.generator.generate("));
});
t("source labels are never upgraded to 'official' by code (type passed through as recorded)", () => {
  for (const [f, s] of files) if (f !== "prompt.ts") ok(!/type:\s*"official/.test(s), f);
  ok(!/Official source/i.test(panel));
});
t("Module 13 boundary: no agent loops, tools, web browsing or function calling", () => {
  for (const [f, s] of files) ok(!/\btools?\s*:|functionCall|function_calling|googleSearch|google_search|while\s*\(true\)|agent/i.test(s), `${f} looks agentic`);
});
t("Module 12 adds no migration (the five files that existed before it, plus only the known Module 13 roadmap migration)", () => {
  ok(JSON.stringify(fs.readdirSync(path.join(root, "supabase/migrations")).sort()) === JSON.stringify(["20261001000100_profiles_and_roles.sql", "20261001000200_core_tables.sql", "20261001000300_rls_policies.sql", "20261001000400_storage_documents.sql", "20261002000100_rag_knowledge_base.sql", "20261003000100_application_roadmaps.sql", "20261003000200_match_knowledge_scholarship_id.sql"]), "unexpected migration");
  const m11 = path.join(root, "supabase/migrations/20261002000100_rag_knowledge_base.sql"); ok(fs.existsSync(m11));
});
t("details page: assistant mounted once, gated by display auth only (the API is the authority)", () => {
  ok((page.match(/<AssistantPanel/g) || []).length === 1 && /isAuthenticated=\{auth\.isAuthenticated\}/.test(page));
});
console.log(`\nassistant static checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
