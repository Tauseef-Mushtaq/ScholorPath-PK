// Source-text security checks for Module 09 (NOT behavioural; behaviour is covered by tests/auth-mock L4 and tests/db).
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const t = (n, ok, extra = "") => { if (ok) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, extra); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const page = strip(read("src/app/(protected)/matches/page.tsx"));
const queries = strip(read("src/lib/matching/queries.ts"));
const routes = read("src/lib/auth/routes.ts");
const libFiles = fs.readdirSync(path.join(ROOT, "src/lib/matching")).filter((f) => f.endsWith(".ts"));
const lib = Object.fromEntries(libFiles.map((f) => [f, strip(read("src/lib/matching/" + f))]));

console.log("Access control");
t("/matches is a protected prefix", /"\/matches"/.test(routes.split("ROLE_RULES")[0]));
t("page re-checks authentication server-side (requireUser)", /requireUser\(\)/.test(page));
t("identity is the session user id", /const \{ user \} = await requireUser\(\)/.test(page) && /loadMatchProfile\(await createClient\(\), user\.id\)/.test(page));
t("page never reads identity from the URL (only parseMatchParams)", !/user_id|profile_id|searchParams\.(get|user|profile)/.test(page) && /parseMatchParams\(await searchParams\)/.test(page));
t("params parser has no identity parameters", !/user_id|profile_id|userId|profileId|email/.test(lib["params.ts"]));

console.log("Data access");
t("student data via the cookie-bound client (createClient)", /createClient\(\)/.test(page));
t("scholarships via the cookie-less anon client", /createPublicClient\(\)/.test(queries) && /from\("scholarships"\)/.test(queries));
t("no service-role / admin client anywhere in the feature", !/supabase\/admin|env\.server|SERVICE_ROLE|service_role/i.test(page + queries + Object.values(lib).join("")));
t("no select('*')", !/select\(\s*["'`]\*/.test(queries) && !/COLUMNS\s*=\s*["'`]\*/.test(queries));
t("scholarship query is bounded (limit) and uses one embedded select (no per-row queries)", /\.limit\(/.test(queries) && /scholarship_requirements\(/.test(queries) && !/for\s*\(.*await|\.map\(\s*async/.test(queries));
t("a status filter is NOT added in SQL (visibility is RLS's job, ADR-030) and the engine re-checks status", !/\.eq\(\s*["']status["']/.test(queries) && /PUBLIC_STATUS/.test(lib["rank.ts"]));
t("profile is loaded by the session user id (no id from the request)", /loadOwnProfile\(supabase, userId\)/.test(queries) && /loadMatchProfile\(supabase: SupabaseClient, userId: string\)/.test(queries));

console.log("Error handling");
t("raw database errors are never returned or rendered", !/error\.message|\.message\b/.test(queries.replace(/e instanceof Error \? e\.name/g, "")) && !/error\.message/.test(page));
t("logs contain only an error code/name", /error\.code/.test(queries) && !/console\.error\([^)]*error\)/.test(queries));
t("page renders a generic unavailable state on failure", /temporarily unavailable/.test(page) && /!profile\.ok/.test(page) && /!candidates\.ok/.test(page));

console.log("Engine isolation (explainable, AI-free, no I/O)");
const pure = Object.entries(lib).filter(([f]) => f !== "queries.ts").map(([, s]) => s).join("\n");
t("pure engine imports no Supabase, Next, React or server-only", !/from ["'](@supabase|next|react|server-only)/.test(pure) && !/server-only/.test(pure));
t("no network, clock, randomness or process access in the engine", !/\bfetch\(|Math\.random|Date\.now|new Date\(\)|process\.env/.test(pure));
t("no AI provider / external API references", !/gemini|grok|openai|anthropic|embedding|vector|rag/i.test(Object.values(lib).join("\n") + page));
t("no hardcoded scholarship or student records in the engine", !/provider:\s*["']/.test(pure) && !/scholarship\s*:\s*\{/.test(pure));
t("no probability/score language in student-facing strings", !/probabilit|chance of|% match|match score|you will (win|receive|be selected)/i.test(pure + page + strip(read("src/components/matches/match-card.tsx"))));

console.log("Repair Session 3 — honest four-way result");
const card = strip(read("src/components/matches/match-card.tsx"));
t("engine exposes the four decisions and the card renders the decision (not the old three-tier status wording)", /eligible.*not_eligible.*needs_information.*unknown/s.test(lib["types.ts"]) && /decisionLabel/.test(card) && !/statusLabel/.test(card));
t("an unresolved field never yields 'likely_eligible' (field participates in deriveStatus)", /function isUnresolved/.test(lib["eligibility.ts"]) && /c\.key === "field"/.test(lib["eligibility.ts"]));
t("page states what is NOT evaluated (nationality, age, English scores, research, preferences, written requirements)", /Not checked at all/.test(page) && /nationality/.test(page) && /English test scores/.test(page) && /research/.test(page) && /preferences/.test(page));
t("engine never claims to evaluate IELTS/nationality/age/research: no check keys for them", !/key:\s*["'](nationality|age|ielts|research|preference)/i.test(lib["eligibility.ts"]) && !/CheckKey\s*=[^;]*(nationality|ielts|age\b|research)/i.test(lib["types.ts"]));

console.log("Scope");
t("no migration added by Module 09", () => {
  const added = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => /match|eligib/i.test(f) && !/match_knowledge/.test(f));
  ok(added.length === 0, "unexpected: " + added.join(","));
});
t("no client component imports server-only code", !/["']use client["']/.test(read("src/components/matches/match-card.tsx")));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
