// Module 06 — LIVE two-user verification of the Storage + RLS layer against a REAL Supabase project.
//
// It uses ONLY the public anon key and two real users' own sessions (exactly what the app's cookie-bound
// client does). It never uses the service-role key. It does NOT exercise the Next.js UI/Server Action/route;
// for that run the manual checklist in docs/HANDOFF.md (steps U1–U12).
//
// Usage (disposable test users in a NON-production project recommended):
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//   TEST_USER_A_EMAIL=... TEST_USER_A_PASSWORD=... TEST_USER_B_EMAIL=... TEST_USER_B_PASSWORD=... \
//   node tests/documents/live-verify.mjs
//
// All objects/rows it creates are removed in a `finally` block (each user cleans up only its own).
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const env = (k) => process.env[k] ?? "";
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const need = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "TEST_USER_A_EMAIL", "TEST_USER_A_PASSWORD", "TEST_USER_B_EMAIL", "TEST_USER_B_PASSWORD"];
const missing = need.filter((k) => !env(k));
if (missing.length) { console.error("Missing env:", missing.join(", "), "\nNOT_VERIFIED: nothing was run."); process.exit(2); }

const BUCKET = "documents";
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

let pass = 0, fail = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); pass++; results.push(["PASS", name]); console.log("  PASS", name); }
  catch (e) { fail++; results.push(["FAIL", name]); console.log("  FAIL", name, "-", String(e.message).split("\n")[0]); }
}
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const mk = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(label, email, password) {
  const c = mk();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`${label}: sign-in failed (${error?.status ?? "?"})`);
  return { c, id: data.user.id };
}

const created = { A: [], B: [] }; // { path, id } for cleanup
async function upload(u, label, ext, mime, bytes, name) {
  const path = `${u.id}/${randomUUID()}.${ext}`;
  const up = await u.c.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);
  const ins = await u.c.from("documents").insert({ user_id: u.id, file_name: name, storage_path: path, mime_type: mime, file_size: bytes.byteLength }).select("id").single();
  if (ins.error) { await u.c.storage.from(BUCKET).remove([path]); throw new Error(`insert failed: ${ins.error.code}`); }
  created[label].push({ path, id: ins.data.id });
  return { path, id: ins.data.id };
}

let A, B;
try {
  console.log("sign-in");
  A = await signIn("A", env("TEST_USER_A_EMAIL"), env("TEST_USER_A_PASSWORD"));
  B = await signIn("B", env("TEST_USER_B_EMAIL"), env("TEST_USER_B_PASSWORD"));
  ok(A.id !== B.id, "A and B must be different users");

  const tag = `live-verify-${Date.now()}`;
  let docPdf, docImg;

  console.log("User A — upload / list / view");
  await t("A uploads a PDF into own folder", async () => { docPdf = await upload(A, "A", "pdf", "application/pdf", PDF, `${tag}.pdf`); });
  await t("A uploads an image into own folder", async () => { docImg = await upload(A, "A", "png", "image/png", PNG, `${tag}.png`); });
  await t("A lists exactly these 2 documents (only own)", async () => {
    const { data, error } = await A.c.from("documents").select("id, user_id").order("created_at");
    ok(!error, "list failed"); ok(data.every((r) => r.user_id === A.id), "foreign row visible");
    ok(data.some((r) => r.id === docPdf.id) && data.some((r) => r.id === docImg.id), "uploaded docs missing");
  });
  await t("A gets a short-lived signed URL and it downloads the right bytes", async () => {
    const { data, error } = await A.c.storage.from(BUCKET).createSignedUrl(docPdf.path, 60);
    ok(!error && data?.signedUrl, "no signed url");
    const r = await fetch(data.signedUrl); ok(r.status === 200, `status ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer()); ok(buf.length === PDF.length, "size differs");
  });
  await t("signed URL expires", async () => {
    const { data } = await A.c.storage.from(BUCKET).createSignedUrl(docImg.path, 2);
    await new Promise((r) => setTimeout(r, 4000));
    const r = await fetch(data.signedUrl); ok(r.status >= 400, `expired URL still returned ${r.status}`);
  });

  console.log("bucket is private");
  await t("public object URL does not serve A's file", async () => {
    const r = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${docPdf.path}`); ok(r.status >= 400, `status ${r.status}`);
  });
  await t("unauthenticated direct object URL does not serve A's file", async () => {
    const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${docPdf.path}`, { headers: { apikey: ANON } }); ok(r.status >= 400, `status ${r.status}`);
  });
  await t("anon client cannot sign a URL or list documents", async () => {
    const anon = mk();
    const s = await anon.storage.from(BUCKET).createSignedUrl(docPdf.path, 60); ok(s.error || !s.data?.signedUrl, "anon signed a URL");
    const l = await anon.from("documents").select("id"); ok(!l.error ? l.data.length === 0 : true, "anon saw rows");
  });

  console.log("Storage constraints (as A, own folder)");
  const own = (ext) => `${A.id}/${randomUUID()}.${ext}`;
  await t("> 10 MB is rejected by Storage", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1); big.set(PDF);
    const p = own("pdf"); const r = await A.c.storage.from(BUCKET).upload(p, big, { contentType: "application/pdf" });
    if (!r.error) await A.c.storage.from(BUCKET).remove([p]); ok(r.error, "oversize upload was accepted");
  });
  await t("text/html is rejected by the bucket MIME allow-list", async () => {
    const p = own("html"); const r = await A.c.storage.from(BUCKET).upload(p, new TextEncoder().encode("<html></html>"), { contentType: "text/html" });
    if (!r.error) await A.c.storage.from(BUCKET).remove([p]); ok(r.error, "html accepted");
  });
  await t("image/gif is rejected by the bucket MIME allow-list", async () => {
    const p = own("gif"); const r = await A.c.storage.from(BUCKET).upload(p, new Uint8Array([71, 73, 70, 56]), { contentType: "image/gif" });
    if (!r.error) await A.c.storage.from(BUCKET).remove([p]); ok(r.error, "gif accepted");
  });
  await t("the DB refuses a disallowed MIME / oversize size in documents", async () => {
    const bad1 = await A.c.from("documents").insert({ user_id: A.id, file_name: "x.html", storage_path: own("html"), mime_type: "text/html", file_size: 10 }); ok(bad1.error?.code === "23514", `mime: ${bad1.error?.code}`);
    const bad2 = await A.c.from("documents").insert({ user_id: A.id, file_name: "x.pdf", storage_path: own("pdf"), mime_type: "application/pdf", file_size: 10485761 }); ok(bad2.error?.code === "23514", `size: ${bad2.error?.code}`);
  });

  console.log("User B — attacks on A's documents (forged ids and forged paths)");
  await t("B does not see A's documents in a list", async () => {
    const { data, error } = await B.c.from("documents").select("id, user_id"); ok(!error, "list failed");
    ok(!data.some((r) => r.user_id === A.id || r.id === docPdf.id || r.id === docImg.id), "B sees A's rows");
  });
  await t("B cannot read A's row by forged id (or by forged user_id filter)", async () => {
    const r1 = await B.c.from("documents").select("id").eq("id", docPdf.id); ok(!r1.error && r1.data.length === 0, "row visible by id");
    const r2 = await B.c.from("documents").select("id").eq("user_id", A.id); ok(!r2.error && r2.data.length === 0, "rows visible by user_id");
  });
  await t("B cannot get a signed URL for A's path", async () => {
    const r = await B.c.storage.from(BUCKET).createSignedUrl(docPdf.path, 60); ok(r.error || !r.data?.signedUrl, "B signed A's path");
  });
  await t("B cannot download A's object", async () => {
    const r = await B.c.storage.from(BUCKET).download(docPdf.path); ok(r.error || !r.data, "B downloaded A's file");
  });
  await t("B cannot update A's row", async () => {
    const r = await B.c.from("documents").update({ file_name: "pwned.pdf" }).eq("id", docPdf.id).select("id"); ok(!r.error ? r.data.length === 0 : true, "B updated A's row");
  });
  await t("B cannot re-parent a row to A or from A", async () => {
    const r = await B.c.from("documents").update({ user_id: B.id }).eq("id", docPdf.id).select("id"); ok(r.error || r.data.length === 0, "re-parented");
  });
  await t("B cannot insert a document owned by A", async () => {
    const r = await B.c.from("documents").insert({ user_id: A.id, file_name: "x.pdf", storage_path: `${A.id}/${randomUUID()}.pdf`, mime_type: "application/pdf", file_size: 5 }); ok(r.error, "insert as A accepted");
  });
  await t("B cannot insert a row (own user_id) that points into A's folder", async () => {
    const r = await B.c.from("documents").insert({ user_id: B.id, file_name: "x.pdf", storage_path: `${A.id}/${randomUUID()}.pdf`, mime_type: "application/pdf", file_size: 5 }); ok(r.error?.code === "23514" || r.error, "path in A's folder accepted");
  });
  await t("B cannot upload into A's folder or the bucket root", async () => {
    const r1 = await B.c.storage.from(BUCKET).upload(`${A.id}/${randomUUID()}.pdf`, PDF, { contentType: "application/pdf" }); ok(r1.error, "upload into A's folder accepted");
    const r2 = await B.c.storage.from(BUCKET).upload(`${randomUUID()}.pdf`, PDF, { contentType: "application/pdf" }); ok(r2.error, "root upload accepted");
    const r3 = await B.c.storage.from(BUCKET).upload(`${B.id}/../${A.id}/${randomUUID()}.pdf`, PDF, { contentType: "application/pdf" }); ok(r3.error || true, "traversal attempt"); // must not land in A's folder (checked below)
  });
  await t("B cannot delete A's object or row", async () => {
    const rm = await B.c.storage.from(BUCKET).remove([docPdf.path]); ok(rm.error || (rm.data ?? []).length === 0, "B removed A's object");
    const del = await B.c.from("documents").delete().eq("id", docPdf.id).select("id"); ok(!del.error ? del.data.length === 0 : true, "B deleted A's row");
  });
  await t("A's documents are unchanged after B's attacks", async () => {
    const { data } = await A.c.from("documents").select("id, file_name, file_size, user_id").eq("id", docPdf.id).single();
    ok(data && data.file_name === `${tag}.pdf` && data.user_id === A.id && data.file_size === PDF.length, "row changed");
    const d = await A.c.storage.from(BUCKET).download(docPdf.path); ok(!d.error && d.data, "A's object missing/unreadable");
    const names = await A.c.storage.from(BUCKET).list(A.id); ok(!names.error && names.data.length === 2, `A's folder has ${names.data?.length} objects (expected 2)`);
  });

  console.log("User A — delete (same order as the app: object first, then row)");
  await t("A deletes one document; row and object are both gone, the other is untouched", async () => {
    const rm = await A.c.storage.from(BUCKET).remove([docImg.path]); ok(!rm.error && rm.data.length === 1, "object not removed");
    const del = await A.c.from("documents").delete().eq("id", docImg.id).eq("user_id", A.id).select("id"); ok(!del.error && del.data.length === 1, "row not deleted");
    created.A = created.A.filter((x) => x.id !== docImg.id);
    const rows = await A.c.from("documents").select("id").eq("id", docImg.id); ok(rows.data.length === 0, "row still listed");
    const ex = await A.c.storage.from(BUCKET).exists(docImg.path); ok(!ex.error && ex.data === false, "object still exists");
    const keep = await A.c.from("documents").select("id").eq("id", docPdf.id); ok(keep.data.length === 1, "other doc affected");
  });
  await t("removing an already-missing object is a harmless no-op (retry-safe delete)", async () => {
    const rm = await A.c.storage.from(BUCKET).remove([docImg.path]); ok(!rm.error, "error on missing object");
  });
} catch (e) {
  fail++; console.log("  FATAL", String(e.message).split("\n")[0]);
} finally {
  console.log("cleanup");
  for (const [label, u] of [["A", A], ["B", B]]) {
    if (!u) continue;
    const items = created[label];
    if (items.length) {
      await u.c.storage.from(BUCKET).remove(items.map((x) => x.path));
      await u.c.from("documents").delete().in("id", items.map((x) => x.id));
    }
    // Sweep anything left in this user's own folder from this run's failures.
    const left = await u.c.storage.from(BUCKET).list(u.id);
    if (left.data?.length) await u.c.storage.from(BUCKET).remove(left.data.map((o) => `${u.id}/${o.name}`));
    const rows = await u.c.from("documents").select("id").like("file_name", "live-verify-%");
    if (rows.data?.length) await u.c.from("documents").delete().in("id", rows.data.map((r) => r.id));
    const check = await u.c.storage.from(BUCKET).list(u.id);
    console.log(`  ${label}: objects left in own folder: ${check.data?.length ?? "?"}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
