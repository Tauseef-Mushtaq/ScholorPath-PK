// Static checks for the Module 10 detail page + components (source text only; NOT runtime proof).
const fs = require("node:fs"); const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS", n); } catch (e) { fail++; console.log("  FAIL", n, "-", e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const page = read("src/app/scholarships/[id]/page.tsx");
const comps = ["detail-parts", "requirement-list", "sources-section", "verification-notice"].map((n) => [n, read(`src/components/scholarship/${n}.tsx`)]);
const all = [["page", page], ...comps];
const detail = read("src/lib/public/detail.ts"), q = read("src/lib/public/queries.ts"), elig = read("src/lib/matching/eligibility.ts");

t("no server secrets, admin client, cookie client or client-side data access in the page/components", () => {
  for (const [n, s] of all) ok(!/SERVICE_ROLE|supabase\/admin|supabase\/server|createClient|createAdminClient|\"use client\"|fetch\(/.test(s), `${n}: forbidden import/usage`);
});
t("no dangerouslySetInnerHTML anywhere in the new UI", () => { for (const [n, s] of all) ok(!/dangerouslySetInnerHTML/.test(s), n); });
t("every target=_blank link has rel=\"noopener noreferrer\"", () => {
  for (const [n, s] of all) { const a = (s.match(/target="_blank"/g) || []).length, b = (s.match(/rel="noopener noreferrer"/g) || []).length; ok(a === b, `${n}: ${a} _blank vs ${b} rel`); }
});
t("no hard-coded external URLs in the page or components (links come only from stored data)", () => { for (const [n, s] of all) ok(!/https?:\/\/(?!schemas)/.test(s.replace(/\/\/.*$/gm, "")), `${n}: hard-coded URL`); });
t("hrefs for external links come from linkView()/safe views, never from raw stored strings", () => {
  ok(!/href=\{s\.official(Application|Information)Url\}|href=\{[a-z.]*sourceUrl\}/.test(page + comps.map((c) => c[1]).join("")), "raw URL used as href");
  ok(/linkView\(s\.officialApplicationUrl\)/.test(page) && /linkView\(s\.officialInformationUrl\)/.test(page), "page does not use linkView");
});
t("invalid ids are rejected before any query; missing/hidden records 404", () => ok(/if \(!isUuid\(id\)\) notFound\(\)/.test(page) && /if \(!s\) notFound\(\)/.test(page), "missing guards"));
t("page and queries never filter or widen status themselves (RLS alone decides draft/archived visibility)", () => ok(!/\.eq\("status"|\.neq\("status"|\.in\("status"|\.or\([^)]*status/.test(page + q), "status handling in app code"));
t("detail query selects explicit columns, includes source_id, never content_hash or *", () => {
  const body = q.split("export const getScholarshipById")[1].split("// Mentors")[0];
  ok(/source_id/.test(body), "source_id not selected"); ok(!/content_hash/.test(body), "content_hash selected"); ok(!/select\(\s*[\"'`]\*[\"'`]/.test(body), "select *");
});
t("unavailable database -> UnavailableState; raw errors never rendered", () => ok(/UnavailableState/.test(page) && !/error\.message|\.stack/.test(page), "missing/unsafe"));
t("every date/status is derived by pure helpers with an explicit 'today' (no fabricated facts)", () => ok(/applicationPhase\(s\.openingDate, s\.deadline, today\)/.test(page) && /verificationState\(s\.lastVerifiedAt, today\)/.test(page), "helpers not used"));
t("unverified listings are flagged: VerificationNotice is rendered and 'never' state warns", () => ok(/<VerificationNotice/.test(page) && /not been verified/.test(detail), "missing"));
t("Pakistan-side literal is identical in the page logic and the matching engine (ADR-032)", () => {
  const a = /PAKISTAN_SIDE_TYPE = "([a-z_]+)"/.exec(detail), b = /PAKISTAN_SIDE_TYPE = "([a-z_]+)"/.exec(elig);
  ok(a && b && a[1] === b[1] && a[1] === "pakistan_side", "literals differ");
});
t("page contains no hard-coded guidance about Pakistani authorities (nothing unverified is invented)", () => ok(!/\b(HEC|IBCC|MoFA|NADRA|attest)/i.test(page + comps.map((c) => c[1]).join("") + detail), "authority-specific text found"));
t("no migration added by Module 10 (folder = the four Module 03 files + only the known Module 11 and Module 13 migrations)", () => { const m = fs.readdirSync(path.join(root, "supabase/migrations")).sort(); ok(JSON.stringify(m) === JSON.stringify(["20261001000100_profiles_and_roles.sql", "20261001000200_core_tables.sql", "20261001000300_rls_policies.sql", "20261001000400_storage_documents.sql", "20261002000100_rag_knowledge_base.sql", "20261003000100_application_roadmaps.sql", "20261003000200_match_knowledge_scholarship_id.sql"]), `unexpected migrations: ${m.join(", ")}`); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
