// Static security regression checks for Module 06. No dependencies, no network, no database.
// Run: node tests/documents/security-static.test.cjs   (also part of `npm run test:documents`)
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  PASS", name); } catch (e) { fail++; console.log("  FAIL", name, "-", e.message.split("\n")[0]); } };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p);
const read = (p) => fs.readFileSync(p, "utf8");
const files = walk(SRC).map((p) => ({ p, rel: rel(p), text: read(p) }));
const isClient = (f) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(f.text);
const docFiles = files.filter((f) => /documents/.test(f.rel));

console.log("service-role isolation");
t("only admin.ts / env.server.ts mention the service-role key", () => {
  const offenders = files.filter((f) => /SERVICE_ROLE/i.test(f.text) && !/lib\/(supabase\/admin|env\.server)\.ts$/.test(f.rel)).map((f) => f.rel);
  assert.deepEqual(offenders, []);
});
t("no client component imports admin / env.server / server-only modules", () => {
  const bad = files.filter((f) => isClient(f) && /supabase\/admin|env\.server|["']server-only["']|documents\/queries/.test(f.text)).map((f) => f.rel);
  assert.deepEqual(bad, []);
});
t("no Module 06 file imports the service-role client or env.server", () => {
  assert.deepEqual(docFiles.filter((f) => /supabase\/admin|env\.server|createAdminClient/.test(f.text)).map((f) => f.rel), []);
});
t("client components under components/documents exist and are 'use client' where they use hooks", () => {
  for (const f of files.filter((x) => x.rel.startsWith("src/components/documents/") && /use(State|ActionState|Ref|Effect)/.test(x.text))) assert.ok(isClient(f), f.rel);
});

console.log("no public URLs / private bucket");
t("no getPublicUrl anywhere in src", () => assert.deepEqual(files.filter((f) => /getPublicUrl/.test(f.text)).map((f) => f.rel), []));
t("no raw '/object/public/' URL construction in src", () => assert.deepEqual(files.filter((f) => /object\/public/.test(f.text)).map((f) => f.rel), []));
t("the only signed-URL producer is the authenticated file route", () => {
  assert.deepEqual(files.filter((f) => /createSignedUrls?\(/.test(f.text)).map((f) => f.rel), ["src/app/(protected)/documents/[id]/file/route.ts"]);
});
t("signed URL lifetime is short (<= 300 s) and used by the route", () => {
  const c = read(path.join(SRC, "lib/documents/constants.ts"));
  const ttl = Number(/SIGNED_URL_TTL_SECONDS\s*=\s*(\d+)/.exec(c)?.[1]);
  assert.ok(ttl > 0 && ttl <= 300, `ttl=${ttl}`);
  assert.match(read(path.join(SRC, "app/(protected)/documents/[id]/file/route.ts")), /createSignedUrl\(row\.storage_path, SIGNED_URL_TTL_SECONDS/);
});
t("storage migration still creates the bucket private and adds no non-owner policy", () => {
  const sql = read(path.join(ROOT, "supabase/migrations/20261001000400_storage_documents.sql"));
  assert.match(sql, /'documents', 'documents', false, 10485760/);
  assert.ok(!/to\s+(anon|public)\b/i.test(sql.replace(/--[^\n]*/g, "")), "policy for anon/public found");
  assert.equal((sql.match(/create policy/gi) || []).length, 4);
});
t("zero migrations were added by Module 06 (folder = the four Module 03 files + only the known Module 11 and Module 13 migrations)", () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "supabase/migrations")).sort(), ["20261001000100_profiles_and_roles.sql", "20261001000200_core_tables.sql", "20261001000300_rls_policies.sql", "20261001000400_storage_documents.sql", "20261002000100_rag_knowledge_base.sql", "20261003000100_application_roadmaps.sql", "20261003000200_match_knowledge_scholarship_id.sql"]);
});

console.log("ownership comes from the session");
const actions = read(path.join(SRC, "lib/documents/actions.ts"));
const route = read(path.join(SRC, "app/(protected)/documents/[id]/file/route.ts"));
t("actions read ONLY file / document_type / id from the form", () => {
  const keys = [...actions.matchAll(/formData\.get\(\s*["']([^"']+)["']/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(keys)], ["document_type", "file", "id"]);
});
t("no user_id / profile_id / owner / storage_path is ever read from the request", () => {
  for (const src of [actions, route]) assert.ok(!/(get|searchParams\.get)\(\s*["'](user_id|userId|profile_id|owner|owner_id|storage_path|path|bucket)["']/.test(src));
});
t("every mutation/read authenticates with auth.getUser()", () => {
  assert.ok((actions.match(/auth\.getUser\(\)/g) || []).length >= 1 && /authenticate\(\)/.test(actions));
  assert.equal((actions.match(/await authenticate\(\)/g) || []).length, 2); // upload + delete
  assert.match(route, /auth\.getUser\(\)/);
});
t("every documents query is scoped by user_id (defence in depth on top of RLS)", () => {
  assert.equal((route.match(/\.eq\("user_id", userId\)/g) || []).length, 1);
  assert.ok((actions.match(/\.eq\("user_id", userId\)/g) || []).length >= 2);
  assert.match(read(path.join(SRC, "lib/documents/queries.ts")), /\.eq\("user_id", userId\)/);
});
t("storage path is server-built; stored MIME is server-derived", () => {
  assert.match(actions, /buildStoragePath\(userId, check\.mime\)/);
  assert.match(actions, /mime_type: check\.mime/);
  assert.ok(!/mime_type:\s*file\.type/.test(actions));
});
t("inserts never write server-owned columns", () => {
  const insert = /\.insert\(\{([\s\S]*?)\}\)/.exec(actions)?.[1] ?? "";
  assert.ok(!/processing_status|extracted_text_reference|\bid:/.test(insert));
});
t("raw errors are never returned to the user (only the server's own fixed validation text)", () => {
  // `check.message` is the output of validateUpload (fixed strings from MESSAGES), not an upstream error.
  const code = actions.replace(/\/\/[^\n]*/g, "").replace(/check\.message/g, "VALIDATION_TEXT");
  assert.ok(!/\.message\b/.test(code), "an upstream .message is referenced");
  const allowed = /^(UNAVAILABLE|UPLOAD_FAILED|DELETE_FAILED|NOT_FOUND|VALIDATION_TEXT|MESSAGES\.[A-Za-z]+)$/;
  const returned = [...code.matchAll(/return\s*\{\s*error:\s*([^}\s]+)\s*\}/g)].map((m) => m[1]);
  assert.ok(returned.length >= 10, "expected to find the error returns");
  for (const r of returned) assert.ok(allowed.test(r), `non-constant error returned: ${r}`);
  assert.ok(!/\.message\b/.test(route));
});
t("list query does not select storage_path / user_id / extracted_text_reference", () => {
  const sel = /\.select\("([^"]+)"\)/.exec(read(path.join(SRC, "lib/documents/queries.ts")))?.[1] ?? "";
  assert.ok(!/storage_path|user_id|extracted_text|processing_status/.test(sel), sel);
});
t("no file contents / tokens / paths are logged (identifiers inspected; string-literal labels ignored)", () => {
  for (const src of [actions, route]) {
    for (const m of src.matchAll(/console\.error\(([^;]*)\);/g)) {
      const identifiers = m[1].replace(/`[^`]*`|"[^"]*"|'[^']*'/g, "");
      assert.ok(!/bytes|\bfile\b|formData|token|key|signed|storage_path|\bpath\b|\bname\b/i.test(identifiers.replace(/e\?\.name|signErr\?\.name/g, "")), m[1]);
    }
  }
  // logSafe is the only helper that logs a caught error: it must log a code/status/name only.
  assert.match(actions, /console\.error\(`\[documents:\$\{where\}\]`, e\?\.code \?\? e\?\.statusCode \?\? e\?\.name \?\? "unknown_error"\)/);
});

console.log("UI never ships secrets or storage internals");
t("components/documents never reference storage_path / service role / signedUrl", () => {
  for (const f of files.filter((x) => x.rel.startsWith("src/components/documents/"))) assert.ok(!/storage_path|SERVICE_ROLE|signedUrl|createSignedUrl/.test(f.text), f.rel);
});
t("view/download are same-origin links to the authenticated route (no direct storage URLs)", () => {
  const list = read(path.join(SRC, "components/documents/document-list.tsx"));
  assert.match(list, /href=\{`\/documents\/\$\{d\.id\}\/file`\}/);
  assert.ok(!/supabase\.co|\/storage\/v1/.test(list));
});
t("/documents stays a protected prefix and the page re-checks the session", () => {
  assert.match(read(path.join(SRC, "lib/auth/routes.ts")), /"\/documents"/);
  assert.match(read(path.join(SRC, "app/(protected)/documents/page.tsx")), /await requireUser\(\)/);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
