// Static checks for the Module 08 public query layer + page (structure only; not runtime proof).
const fs = require("node:fs"); const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const q = read("src/lib/public/queries.ts"), page = read("src/app/scholarships/page.tsx"), filt = read("src/lib/public/filters.ts");

t("public queries use only the anon public client (no service role, no cookies client)", () => ok(/createPublicClient/.test(q) && !/createAdminClient|supabase\/admin|supabase\/server|SERVICE_ROLE/.test(q), "wrong client"));
t("no select('*') in the public query layer", () => ok(!/select\(\s*["'`]\*["'`]/.test(q), "select *"));
t("no status filter is added by the app (RLS alone decides visibility) and none widens it", () => ok(!/\.eq\("status"|\.neq\("status"|\.in\("status"/.test(q), "status filter in app code"));
t("search keeps tokens capped and ids validated before use in or()", () => ok(/MAX_SEARCH_TOKENS/.test(filt) && /UUID\.test\(id\)/.test(filt) && /idsMatchingToken/.test(q), "missing guards"));
t("university slug that does not exist yields NO results (never all)", () => ok(/Unknown slug|unknown slug/i.test(q) && /items: \[\], total: 0/.test(q), "missing"));
t("search lookups are batched (no per-row queries in loops)", () => { const body = q.split("export async function getScholarships(")[1].split("export async function getFilterOptions")[0]; ok(!/for \(const (row|s|item)\b[^)]*\)\s*\{[^}]*await /.test(body), "await inside row loop"); });
t("page sends the query through loadSoft (query failure -> in-page unavailable state)", () => ok(/loadSoft/.test(page) && /UnavailableState/.test(page), "missing"));
t("page has Reset filters, labelled inputs and a polite results count", () => ok(/Reset filters/.test(page) && /htmlFor="q"/.test(page) && /aria-live="polite"/.test(page), "missing"));
t("page imports no server secrets / no client-side data fetching", () => ok(!/service|SERVICE_ROLE|"use client"/.test(page), "bad import"));
t("auto-submit component is a thin client component without data access", () => { const c = read("src/components/public/filter-auto-submit.tsx"); ok(/"use client"/.test(c) && !/supabase|fetch\(/.test(c), "bad"); });
t("no migration added by Module 08 (folder = the four Module 03 files + only the known Module 11 and Module 13 migrations)", () => { const m = fs.readdirSync(path.join(root, "supabase/migrations")).sort(); ok(JSON.stringify(m) === JSON.stringify(["20261001000100_profiles_and_roles.sql", "20261001000200_core_tables.sql", "20261001000300_rls_policies.sql", "20261001000400_storage_documents.sql", "20261002000100_rag_knowledge_base.sql", "20261003000100_application_roadmaps.sql", "20261003000200_match_knowledge_scholarship_id.sql"]), `unexpected migrations: ${m.join(", ")}`); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
