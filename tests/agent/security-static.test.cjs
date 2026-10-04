// Module 13 static security checks: source/SQL TEXT checks. They are NOT runtime proof (see unit + mutation tests).
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log("  PASS " + n); } catch (e) { fail++; console.log("  FAIL " + n + " - " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

const dir = "src/lib/agent";
const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".ts")).map((f) => [f, strip(read(path.join(dir, f)))]);
const F = (n) => files.find(([f]) => f === n)[1];
const route = strip(read("src/app/api/agent/run/route.ts"));
const sql = read("supabase/migrations/20261003000100_application_roadmaps.sql");

t("route: nodejs + force-dynamic, JSON only (415), same-origin REQUIRED (missing Origin rejected), no-store", () => {
  ok(/runtime = "nodejs"/.test(route) && /dynamic = "force-dynamic"/.test(route) && /415/.test(route) && /Cache-Control": "no-store"/.test(route));
  ok(/!originHost \|\| !host \|\| originHost !== host\) return json\(\{ error: "forbidden" \}, 403\)/.test(route) && !/if \(origin\) \{/.test(route), "origin must be mandatory");
});
t("route: authentication (401) and origin/content-type checks precede body parsing and any agent call", () => {
  const i = (s) => route.indexOf(s);
  ok(i("unsupported_media_type") < i("getCurrentUser()") && i("forbidden") < i("getCurrentUser()") && i("getCurrentUser()") < i("request.json()") && i("request.json()") < i("startAgentRun(") && i("validateRunBody(") < i("startAgentRun("));
  ok(/unauthenticated" \}, 401/.test(route));
});
t("route: identity is the session user only; the body can never carry userId/tool/approval", () => {
  ok(/userId: current\.user\.id/.test(route) && (route.match(/userId:/g) || []).length === 2);
  ok(!/body\.(userId|user|tool|approved)|v\.value\.(userId|tool)/.test(route));
});
t("route: generic errors only — no raw error messages, stacks or env access", () => {
  ok(!/\.message|\.stack|console\.(log|error)|process\.env/.test(route)); ok(/catch \{\s*return json\(\{ error: "agent_failed" \}, 500\)/.test(route));
});
t("tool adapters and service are server-only and use ONLY the user's RLS client (no service-role, no admin client, no env)", () => {
  for (const f of ["executors.server.ts", "service.server.ts"]) ok(/^import "server-only";/.test(F(f).trim()), f);
  ok(!/getSupabaseServiceRoleKey|createAdminClient|supabase\/admin|process\.env|SERVICE_ROLE/.test(F("executors.server.ts")), "executors must not touch privileged access");
  ok(/createClient\(\)/.test(F("service.server.ts")) && !/createAdminClient|supabase\/admin/.test(F("service.server.ts")));
});
t("the service-role key is used for exactly one thing: deriving the approval-signing key (server-only, never returned)", () => {
  const s = F("service.server.ts"); ok((s.match(/getSupabaseServiceRoleKey\(\)/g) || []).length === 1 && /scholarpath-agent-approval-v1/.test(s) && /timingSafeEqual/.test(s));
  for (const [f, src] of files) if (f !== "service.server.ts") ok(!/SERVICE_ROLE|getSupabaseServiceRoleKey/.test(src), f);
});
t("pure agent modules have no I/O, no dynamic code, no network, no env", () => {
  for (const [f, src] of files) { if (/\.server\.ts$/.test(f)) continue; ok(!/\bfetch\(|process\.env|\beval\(|new Function|\bimport\(|\brequire\(|child_process|node:fs|supabase/i.test(src), `${f} has I/O or dynamic code`); }
  for (const [f, src] of files) ok(!/\beval\(|new Function|\bimport\(|child_process/.test(src), f);
});
t("orchestrator: executors are reachable only through the policy-guarded path (execTool) and the verified approval path", () => {
  const o = F("orchestrator.ts"); ok((o.match(/deps\.executors\[/g) || []).length === 2, "exactly two call sites");
  const e = o.slice(o.indexOf("async function execTool"), o.indexOf("const MODEL_MAY_PROPOSE") === -1 ? undefined : o.indexOf("const TERMINAL_FOR"));
  ok(e.indexOf("decideToolCall(") < e.indexOf("deps.executors[") && /decision\.kind === "approval"[\s\S]*?return \{[^}]*awaiting: true/.test(e) && e.indexOf('decision.kind === "approval"') < e.indexOf("deps.executors["), "decision and approval return precede execution");
  const r = o.slice(o.indexOf("export async function resumeApproval")); ok(r.indexOf("verifyApprovalToken(") < r.indexOf("deps.executors[") && r.indexOf("parseInput(") < r.indexOf("deps.executors[") && /risk !== "APPROVAL_REQUIRED"/.test(r));
});
t("orchestrator: model proposals are limited to searchRag; mutation content is server-derived", () => {
  ok(/MODEL_MAY_PROPOSE: readonly ExecutableToolName\[\] = \["searchRag"\]/.test(F("orchestrator.ts")) && /fromModel \? MODEL_MAY_PROPOSE/.test(F("orchestrator.ts")));
  ok(/taskCandidates\(/.test(F("orchestrator.ts")) && /roadmapSteps\(/.test(F("orchestrator.ts")));
});
t("policy order: registry -> forbidden -> allowed -> identity -> autonomy -> limits -> validation -> scope -> approval", () => {
  const p = F("policy.ts"), ix = (s) => p.indexOf(s);
  const order = ["lookupTool(", 'def.risk === "FORBIDDEN"', "allowed &&", "!state.userId", "RANK[state.autonomy]", "maxToolCalls", "parseInput(", "state.scholarshipId !== null", 'def.risk === "APPROVAL_REQUIRED"'];
  for (let i = 1; i < order.length; i++) ok(ix(order[i - 1]) >= 0 && ix(order[i - 1]) < ix(order[i]), `${order[i - 1]} before ${order[i]}`);
});
t("registry: lookups use own-property checks; forbidden tools have no executor; no tool is named for a forbidden capability", () => {
  const r = F("tools.ts"); ok(/hasOwnProperty\.call\(REGISTRY/.test(r) && /Object\.freeze/.test(r));
  const types = F("types.ts"); ok(/ForbiddenToolName = "submitApplication" \| "sendEmail" \| "sendMessage" \| "signDocument" \| "acceptTerms" \| "makePayment"/.test(types));
  const ex = F("executors.server.ts"); ok(!/submit|sendEmail|sendMessage|signDocument|acceptTerms|makePayment|\.from\("admin_actions"\)/.test(ex));
  ok(!/status:\s*"submitted"|submitted_at/.test(ex), "agent must never mark an application submitted");
});
t("tool adapters: user id from ToolContext only; documents filtered by owner; RAG chunks filtered by scholarship; scholarship visibility checked by RLS first", () => {
  const e = F("executors.server.ts"); ok(/async getStudentProfile\(_input, ctx\)/.test(e) && /loadMatchProfile\(supabase, ctx\.userId\)/.test(e) && /loadOwnDocuments\(supabase, ctx\.userId\)/.test(e));
  ok(/\.eq\("user_id", ctx\.userId\)/.test(e) && /chunkBelongsToScholarship\(c, scholarshipId\)/.test(e));
  const rag = e.slice(e.indexOf("async searchRag")); ok(rag.indexOf("loadScholarship(") < rag.indexOf("retrieve({"));
  ok(!/input\.userId|\.userId\b(?!\))/.test(e.replace(/ctx\.userId/g, "")), "no other userId source");
  ok(/applications"\)\.insert\(\{ user_id: userId, scholarship_id: scholarshipId, status: "planning" \}/.test(e));
});
t("agent module never imports a client component or the React runtime; the client panel imports no agent server code", () => {
  for (const [f, src] of files) ok(!/from "react"|"use client"/.test(src), f);
  const panel = read("src/components/scholarship/agent-panel.tsx"); ok(/^"use client";/.test(panel) && !/lib\/agent|lib\/knowledge|lib\/supabase|env\.server/.test(panel));
  for (const f of walk("src/components").filter((x) => /\.tsx?$/.test(x))) ok(!/lib\/agent\/(service|executors)\.server/.test(read(f)), f);
  for (const f of [...walk("src/app"), ...walk("src/components")].filter((x) => /\.tsx?$/.test(x))) { const s = read(f); if (/^"use client"/.test(s.trim())) ok(!/lib\/agent/.test(s), f + " (client) imports agent code"); }
});
t("no secret reaches the browser: no NEXT_PUBLIC variant of any key, none in agent/UI code", () => {
  for (const f of [...walk("src").filter((x) => /\.(ts|tsx)$/.test(x))]) ok(!/NEXT_PUBLIC_[A-Z_]*(GEMINI|SERVICE_ROLE|SECRET|APPROVAL)/.test(read(f)), f);
  ok(!/GEMINI|SERVICE_ROLE|x-goog-api-key/.test(read("src/components/scholarship/agent-panel.tsx")));
});
t("the Gemini client is the Module 12 provider (no second client): no direct Gemini URL or key handling in agent code", () => {
  for (const [f, src] of files) ok(!/generativelanguage|x-goog-api-key|GEMINI_API_KEY/.test(src), f);
  ok(/new GeminiGenerationProvider\(/.test(F("service.server.ts")) && /from "\.\.\/assistant\/generation"/.test(F("service.server.ts")));
});
t("RAG is reused, not re-implemented: no embeddings/vector code in the agent", () => { for (const [f, src] of files) ok(!/embedContent|match_knowledge_chunks|knowledge_chunks|knowledge_documents|pgvector/.test(src), f); ok(/retrieve\b/.test(F("service.server.ts"))); });
t("hard limits exist and the loop enforces each one", () => {
  const c = F("config.ts"), o = F("orchestrator.ts"), p = F("policy.ts");
  for (const k of ["maxIterations", "maxToolCalls", "maxModelCalls", "maxExecutionMs", "maxEvidenceChars", "maxRejectedProposals"]) ok(c.includes(k), k);
  ok(/maxIterations/.test(o) && /maxExecutionMs/.test(o) && /evidenceBudgetExceeded/.test(o) && /maxModelCalls/.test(o) && /maxToolCalls/.test(p) && /maxRejectedProposals/.test(o));
  ok(!/while\s*\(true\)|for\s*\(\s*;\s*;\s*\)/.test(o), "no unbounded loop");
});
t("prompt: rules live in the system instruction; untrusted data is delimited and neutralised; no tool list is exposed to the model beyond searchRag", () => {
  const m = F("model.ts"); ok(/UNTRUSTED DATA/.test(m) && /neutralize\(/.test(m) && /<\(\\s\*\\\/\?\\s\*\)\(data\|task\)/.test(m.replace(/\\\\/g, "\\")) || /\(data\|task\)/.test(m));
  ok(!/submitApplication|sendEmail|makePayment/.test(m.slice(m.indexOf("SYSTEM_INSTRUCTION"), m.indexOf("]).join"))));
});
t("approval tokens: HMAC-signed, user-bound, expiring; only APPROVAL_REQUIRED tools; re-validated on use", () => {
  const a = F("approval.ts"); ok(/signer\.verify\(/.test(a) && /p\.u !== userId/.test(a) && /nowMs > p\.e/.test(a) && /def\.risk !== "APPROVAL_REQUIRED"/.test(a));
});
t("scope: Module 13 adds exactly one API route and no Module 14-18 pages/features", () => {
  const routes = walk("src/app/api").filter((f) => /route\.ts$/.test(f)).map((f) => f.split(path.sep).join("/")).sort();
  ok(JSON.stringify(routes) === JSON.stringify(["src/app/api/admin/knowledge/ingest/route.ts", "src/app/api/agent/run/route.ts", "src/app/api/assistant/ask/route.ts", "src/app/api/health/route.ts"]), routes.join(", "));
  const all = walk("src").join("\n"); ok(!/workspace|copilot|application-review|mentor-community/i.test(all.replace(/src\/app\/mentors|src\/lib\/auth/g, "")), "no Module 14-18 files");
  ok(!/nodemailer|sendgrid|resend|twilio|puppeteer|playwright/i.test(read("package.json")), "no mail/browser-automation dependency");
});
t("migration: RLS on both tables, owner-only via ownership functions, no anon access, no permissive policy, no admin/service policy", () => {
  ok(/enable row level security/.test(sql) && (sql.match(/enable row level security/g) || []).length === 2);
  ok(/revoke all on table public\.application_roadmaps, public\.application_roadmap_steps from anon, authenticated/.test(sql) && !/grant [^;]*\bto anon\b/.test(sql));
  ok(!/using \(true\)|with check \(true\)|to public/.test(sql));
  const policies = sql.match(/create policy \w+ on [\w.]+ for \w+ to \w+/g) || []; ok(policies.length === 8 && policies.every((p) => /to authenticated$/.test(p)));
  ok(/owns_application\(application_id\)/.test(sql) && /owns_roadmap\(roadmap_id\)/.test(sql) && /security definer/.test(sql) && /set search_path = ''/.test(sql));
  ok(/grant insert \(application_id, title, summary\) on public\.application_roadmaps/.test(sql) && /grant update \(title, summary\)/.test(sql), "ownership column cannot be changed after insert");
});
t("earlier migrations are untouched (sha256 of the four Module 03 files + Module 11 file pinned)", () => {
  const crypto = require("node:crypto");
  const pinned = JSON.parse(fs.readFileSync(path.join(__dirname, "migration-hashes.json"), "utf8"));
  for (const [f, h] of Object.entries(pinned)) ok(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "supabase/migrations", f))).digest("hex") === h, f + " changed");
});
t("UI: panel mounted inside the existing assistant panel (single place), states what it can do, shows approval controls and a never-submits notice", () => {
  const a = read("src/components/scholarship/assistant-panel.tsx"), p = read("src/components/scholarship/agent-panel.tsx");
  ok((a.match(/<AgentPanel/g) || []).length === 1 && /never submit an application/i.test(p) && /Approve/.test(p) && /Decline/.test(p) && /Next recommended action/.test(p) && /Your approval is needed/.test(p));
  ok(!/chain.of.thought|reasoning|dangerouslySetInnerHTML/i.test(strip(p)), "no reasoning display, no raw HTML");
  ok(!/\.toolCalls|tool:\s|toolName/.test(p), "no internal tool details in the UI");
});
t("discovery: criteria logic is pure; the search adapter has NO query of its own and delegates to the existing Module 08 functions", () => {
  ok(!/\.from\(|ilike|\.rpc\(/.test(F("discovery.ts")), "discovery.ts must not query");
  const e = F("executors.server.ts"); ok(/runCatalogSearch\(input, catalog\)/.test(e) && !/\.ilike|name\.ilike|provider\.ilike/.test(e), "adapter delegates, no private ILIKE query");
  const sv = F("service.server.ts"); ok(/loadVocabulary: getFilterOptions/.test(sv) && /searchCatalog: getScholarships/.test(sv) && /from "\.\.\/public\/queries"/.test(sv), "wired to getFilterOptions/getScholarships");
});
t("discovery: the model's reply is strict data — exact top-level key, allow-listed criteria keys, text allow-list; the model never names a tool", () => {
  const m = F("model.ts"), d = F("discovery.ts");
  ok(/top\.length !== 1 \|\| top\[0\] !== "criteria"/.test(m) && /!CRITERIA_KEYS\.includes\(k\)/.test(m) && /TEXT_OK\.test\(t\)/.test(d));
  ok(/searchByCriteria[\s\S]*tool: "searchScholarships"[\s\S]*deps, false\)/.test(F("orchestrator.ts")), "the server, not the model, issues the search (fromModel=false)");
  ok(/MODEL_MAY_PROPOSE: readonly ExecutableToolName\[\] = \["searchRag"\]/.test(F("orchestrator.ts")));
});
t("discovery: several matches are never auto-selected; unknown country/degree is never dropped; failure is not reported as 'no results'", () => {
  const d = F("discovery.ts"); ok(/search\.items\.length === 1 && search\.total === 1 && search\.dropped\.length === 0/.test(d) && /if \(r\.unresolved\.length\) return/.test(d));
  const o = F("orchestrator.ts"); ok(/result\.state === "selection_required"\) return S\.terminate\(S\.pauseStep/.test(o) && /if \(!found\.data\) return/.test(o));
});
t("UI: discovery panel is a thin client component (posts to the existing route, no agent/server imports) mounted once on /scholarships for signed-in users", () => {
  const p = read("src/components/scholarship/discovery-panel.tsx"), pg = read("src/app/scholarships/page.tsx");
  ok(/^"use client";/.test(p) && !/lib\/agent|lib\/knowledge|lib\/supabase|env\.server|dangerouslySetInnerHTML/.test(p) && /\/api\/agent\/run/.test(p));
  ok((pg.match(/<DiscoveryPanel/g) || []).length === 1 && /auth\.isAuthenticated/.test(pg));
});
t("profile tool (Repair Session 5): identity from ToolContext only, input ignored, distinct missing/error loader, pure mapper, no client import, no service role", () => {
  const e = F("executors.server.ts"), g = e.slice(e.indexOf("async getStudentProfile"), e.indexOf("async getStudentDocuments"));
  ok(/async getStudentProfile\(_input, ctx\)/.test(g) && /loadOwnProfileResult\(supabase, ctx\.userId\)/.test(g), "session identity");
  ok(!/_input|input\./.test(g.replace("async getStudentProfile(_input, ctx)", "")), "tool input is never read");
  ok(/r\.status === "error"\) return fail\("getStudentProfile", "unavailable"\)/.test(g) && /toAgentProfile\(/.test(g), "failure is not an empty profile");
  const q = strip(read("src/lib/profile/queries.ts"));
  ok(/^import "server-only";/m.test(q) && /\.eq\("user_id", userId\)/.test(q) && /\.eq\("profile_id", profile\.id\)/.test(q) && !/service_role|SERVICE_ROLE|supabase\/admin|env\.server/.test(q), "own-row filters, server-only, no admin client");
  const pr = F("profile.ts"); ok(!/^import .*(supabase|server-only|next\/|node:)/m.test(pr) && !/\bfetch\(|process\.env/.test(pr), "mapper is pure");
  ok(!/user_id|profile_id|date_of_birth|\bid:/.test(pr.replace(/r\.id/g, "")), "mapper copies no ids / dob");
  const bad = walk("src/components").filter((f) => /\.(tsx?)$/.test(f)).filter((f) => /lib\/profile\/queries|lib\/agent\/(executors|profile|service)/.test(read(f)));
  ok(bad.length === 0, "client components must not import private profile retrieval: " + bad.join(","));
  ok(/profileDigest\(s\.profile\)/.test(F("model.ts")) && /isAgentProfile\(d\.profile\)/.test(F("orchestrator.ts")), "profile reaches the digest; output contract enforced");
  ok(!/"userId"|userId:/.test(F("tools.ts").slice(F("tools.ts").indexOf('name: "getStudentProfile"'), F("tools.ts").indexOf('name: "getStudentDocuments"'))), "tool schema has no userId parameter");
});
t("document requirements (Repair Session 6): pure coverage, ownership on analyze/list, no content extraction invented", () => {
  const d = F("documents.ts");
  ok(!/^import .*(supabase|server-only|next\/|node:|fs|fetch)/m.test(d) && !/\bfetch\(|process\.env|storage\.from|createSignedUrl|extracted/.test(d), "documents.ts is pure metadata logic");
  ok(/documentCoverage|documentGaps|mapTitleToVaultType|documentDigest/.test(d));
  const e = F("executors.server.ts");
  const an = e.slice(e.indexOf("async analyzeDocument"), e.indexOf("async createTask"));
  ok(/\.eq\("id", documentId\)/.test(an) && /\.eq\("user_id", ctx\.userId\)/.test(an), "analyzeDocument scopes by owner");
  ok(/analysis_not_supported/.test(an) && !/extracted_text|ocr|pdf-parse|readFile|download/.test(an), "no content pipeline invented");
  const gd = e.slice(e.indexOf("async getStudentDocuments"), e.indexOf("async checkEligibility"));
  ok(/loadOwnDocuments\(supabase, ctx\.userId\)/.test(gd) && /documentType: d\.document_type/.test(gd));
  ok(!/storage_path|extracted_text_reference|user_id:/.test(gd.replace("ctx.userId", "")), "list returns metadata only");
  ok(/documentDigest\(s\.documents, s\.requirements\)/.test(F("model.ts")), "digest includes coverage");
  ok(/documentCoverage|documentGaps/.test(F("report.ts")), "gaps use coverage");
  const bad = walk("src/components").filter((f) => /\.(tsx?)$/.test(f)).filter((f) => /lib\/agent\/documents/.test(read(f)));
  ok(bad.length === 0, "client components must not import agent documents: " + bad.join(","));
});
console.log(`\nagent static checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
