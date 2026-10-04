// Unit tests for the pure Module 06 validators. Compiled from TS by run-unit.sh.
const assert = require("node:assert/strict");
const path = require("node:path");
const dir = process.argv[2];
const V = require(path.join(dir, "validation.js"));
const C = require(path.join(dir, "constants.js"));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  PASS", name); } catch (e) { fail++; console.log("  FAIL", name, "-", e.message.split("\n")[0]); } };

const enc = (s) => Uint8Array.from(Buffer.from(s, "latin1"));
const cat = (...parts) => { const b = Buffer.concat(parts.map((p) => Buffer.from(p))); return Uint8Array.from(b); };
const PDF = enc("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
const JPG = cat([0xff, 0xd8, 0xff, 0xe0], enc("JFIF..."));
const PNG = cat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], enc("....IHDR"));
const DOCX = cat([0x50, 0x4b, 0x03, 0x04], enc("....[Content_Types].xml....word/document.xml...."));
const ZIP_ONLY = cat([0x50, 0x4b, 0x03, 0x04], enc("....xl/workbook.xml...."));
const HTML = enc("<html><script>alert(1)</script></html>");
const EXE = cat([0x4d, 0x5a, 0x90, 0x00], enc("This program cannot be run in DOS mode"));
const v = (name, bytes, clientType = "") => V.validateUpload({ name, clientType, bytes });
const bad = (r, code) => { assert.equal(r.ok, false, "expected rejection"); assert.equal(r.code, code); };

console.log("valid uploads");
t("PDF", () => { const r = v("cv.pdf", PDF, "application/pdf"); assert.equal(r.ok, true); assert.equal(r.mime, "application/pdf"); });
t("JPEG (.jpg)", () => assert.equal(v("photo.jpg", JPG, "image/jpeg").mime, "image/jpeg"));
t("JPEG (.jpeg, upper-case)", () => assert.equal(v("PHOTO.JPEG", JPG, "image/jpeg").ok, true));
t("PNG", () => assert.equal(v("scan.png", PNG, "image/png").mime, "image/png"));
t("DOCX", () => assert.equal(v("sop.docx", DOCX, C.DOCX_MIME).mime, C.DOCX_MIME));
t("empty browser type is accepted (some browsers omit it); stored MIME comes from the server", () => { const r = v("sop.docx", DOCX, ""); assert.equal(r.ok, true); assert.equal(r.mime, C.DOCX_MIME); });
t("browser type with parameters is normalised", () => assert.equal(v("cv.pdf", PDF, "application/pdf; charset=binary").ok, true));
t("PDF header may follow a short preamble (<1024 bytes)", () => assert.equal(v("cv.pdf", cat(enc("\n".repeat(100)), PDF)).ok, true));
t("multiple dots / spaces / unicode names are fine", () => { const r = v("my.cv.final v2 رپورٹ.pdf", PDF); assert.equal(r.ok, true); assert.equal(r.displayName, "my.cv.final v2 رپورٹ.pdf"); });

console.log("size");
t("exactly 10 MB is accepted", () => { const big = new Uint8Array(C.MAX_FILE_SIZE_BYTES); big.set(PDF); assert.equal(v("big.pdf", big).ok, true); });
t("10 MB + 1 byte is rejected", () => { const big = new Uint8Array(C.MAX_FILE_SIZE_BYTES + 1); big.set(PDF); bad(v("big.pdf", big), "too_large"); });
t("empty file rejected", () => bad(v("a.pdf", new Uint8Array(0)), "empty"));
t("limit matches bucket/CHECK (10485760)", () => assert.equal(C.MAX_FILE_SIZE_BYTES, 10485760));

console.log("extension / MIME");
t("unsupported extensions", () => { for (const n of ["x.html", "x.exe", "x.svg", "x.gif", "x.doc", "x.txt", "x.zip", "x.pdf.exe", "x.php", "noextension", ".pdf", "x."]) bad(v(n, PDF), "unsupported_type"); });
t("unsupported browser MIME types", () => { for (const m of ["text/html", "application/octet-stream", "image/svg+xml", "application/zip", "image/gif"]) bad(v("cv.pdf", PDF, m), "unsupported_type"); });
t("browser MIME disagreeing with the extension is a mismatch", () => bad(v("cv.pdf", PDF, "image/png"), "type_mismatch"));
t("non-string name / type do not crash", () => { bad(V.validateUpload({ name: undefined, clientType: 5, bytes: PDF }), "unsupported_type"); bad(V.validateUpload({ name: { a: 1 }, clientType: null, bytes: PDF }), "unsupported_type"); });

console.log("signature (magic bytes)");
t("HTML renamed .pdf rejected", () => bad(v("malware.pdf", HTML, "application/pdf"), "type_mismatch"));
t("HTML renamed .png / .jpg / .docx rejected", () => { bad(v("a.png", HTML), "type_mismatch"); bad(v("a.jpg", HTML), "type_mismatch"); bad(v("a.docx", HTML), "type_mismatch"); });
t("EXE renamed .pdf rejected", () => bad(v("setup.pdf", EXE), "type_mismatch"));
t("PDF bytes named .png rejected", () => bad(v("x.png", PDF), "type_mismatch"));
t("PNG bytes named .jpg rejected", () => bad(v("x.jpg", PNG), "type_mismatch"));
t("plain ZIP / XLSX renamed .docx rejected", () => bad(v("x.docx", ZIP_ONLY), "type_mismatch"));
t("PDF marker beyond the first 1024 bytes is not accepted", () => bad(v("x.pdf", cat(enc("a".repeat(2000)), PDF)), "type_mismatch"));

console.log("display names");
const n = V.sanitizeDisplayName;
t("path traversal stripped", () => { assert.equal(n("../../file.pdf"), "file.pdf"); assert.equal(n("/other-user/file.pdf"), "file.pdf"); assert.equal(n("..\\..\\win\\file.pdf"), "file.pdf"); assert.equal(n("a/b/c/d.pdf"), "d.pdf"); });
t("bare dots / empty / non-string fall back", () => { for (const x of ["..", "...", "", "   ", "/", "\\", undefined, null, 42]) assert.equal(n(x), "document"); });
t("control chars and bidi overrides removed", () => { assert.equal(n("a\u0000b\nc.pdf"), "abc.pdf"); assert.equal(n("evil\u202Efdp.exe"), "evilfdp.exe"); });
t("hostile characters replaced; whitespace collapsed; leading dots removed", () => { assert.equal(n('a<b>:"|?*.pdf'), "a_b______.pdf"); assert.equal(n("  my   cv  .pdf"), "my cv .pdf"); assert.equal(n(".hidden.pdf"), "hidden.pdf"); });
t("unicode preserved (NFC)", () => { assert.equal(n("résumé.pdf"), "résumé.pdf"); assert.equal(n("re\u0301sume\u0301.pdf"), "résumé.pdf"); assert.equal(n("رپورٹ.pdf"), "رپورٹ.pdf"); });
t("very long names truncated to <=150 code points, extension kept", () => { const r = n("x".repeat(500) + ".pdf"); assert.ok(Array.from(r).length <= C.DISPLAY_NAME_MAX); assert.ok(r.endsWith(".pdf")); const e = n("😀".repeat(300) + ".png"); assert.ok(Array.from(e).length <= C.DISPLAY_NAME_MAX); assert.ok(e.endsWith(".png")); assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(e)); });
t("long name without extension truncated too", () => assert.ok(Array.from(n("y".repeat(400))).length <= C.DISPLAY_NAME_MAX));

console.log("fileExtension");
t("cases", () => { const e = V.fileExtension; assert.equal(e("a.PDF"), "pdf"); assert.equal(e("a.b.c.docx"), "docx"); assert.equal(e("a"), ""); assert.equal(e(".pdf"), ""); assert.equal(e("a.pdf "), "pdf"); assert.equal(e("a.pdf."), "pdf"); assert.equal(e("dir.pdf/file"), ""); assert.equal(e("a.p df"), ""); });

console.log("storage paths");
const U = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";
t("path is <user id>/<uuid>.<ext from the verified type>", () => { const p = V.buildStoragePath(U, "application/pdf"); assert.match(p, /^11111111-1111-1111-1111-111111111111\/[0-9a-f-]{36}\.pdf$/); assert.match(V.buildStoragePath(U, "image/jpeg"), /\.jpg$/); assert.match(V.buildStoragePath(U, C.DOCX_MIME), /\.docx$/); });
t("paths are unique", () => { const s = new Set(Array.from({ length: 500 }, () => V.buildStoragePath(U, "image/png"))); assert.equal(s.size, 500); });
t("user id is lower-cased (matches auth.uid()::text) and must be a UUID", () => { assert.ok(V.buildStoragePath(U.toUpperCase().replace(/1/g, "A"), "image/png").startsWith("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/")); for (const bad of ["../x", "", "user", `${U}/../${V2}`, "11111111-1111-1111-1111-11111111111"]) assert.throws(() => V.buildStoragePath(bad, "image/png")); });
t("unknown MIME cannot build a path", () => assert.throws(() => V.buildStoragePath(U, "text/html")));
t("isStoragePathForUser accepts only <own id>/<single safe segment>", () => {
  const ok = V.isStoragePathForUser;
  assert.equal(ok(`${U}/abc-123.pdf`, U), true);
  for (const p of [`${V2}/abc.pdf`, `${U}/../${V2}/abc.pdf`, `${U}/a/b.pdf`, `${U}/`, U, `${U}/..pdf`, `/${U}/a.pdf`, `${U}/.hidden`, "", null, undefined, 5]) assert.equal(ok(p, U), false, String(p));
  assert.equal(ok(`${U}/a.pdf`, "not-a-uuid"), false);
});

console.log("misc");
t("document type allow-list", () => { assert.equal(V.parseDocumentType(""), null); assert.equal(V.parseDocumentType(undefined), null); assert.equal(V.parseDocumentType(null), null); assert.equal(V.parseDocumentType("transcript"), "transcript"); for (const x of ["admin", "TRANSCRIPT", "x".repeat(500), 5, {}, "<script>"]) assert.equal(V.parseDocumentType(x), undefined); });
t("precheckFile (client hint)", () => { assert.equal(V.precheckFile({ name: "a.pdf", size: 10 }), null); assert.equal(V.precheckFile({ name: "a.pdf", size: 0 }), V.MESSAGES.empty); assert.equal(V.precheckFile({ name: "a.pdf", size: C.MAX_FILE_SIZE_BYTES + 1 }), V.MESSAGES.tooLarge); assert.equal(V.precheckFile({ name: "a.html", size: 10 }), V.MESSAGES.unsupported); });
t("user-facing messages are generic", () => { assert.equal(V.MESSAGES.unsupported, "This file type isn't supported."); assert.equal(V.MESSAGES.tooLarge, "This file is larger than 10 MB."); });
t("isUuid", () => { assert.equal(V.isUuid(U), true); for (const x of ["", "abc", `${U}x`, `${U}\n`, null, 5, "' or 1=1 --"]) assert.equal(V.isUuid(x), false); });
t("formatFileSize / labels", () => { assert.equal(V.formatFileSize(512), "512 B"); assert.equal(V.formatFileSize(1536), "1.5 KB"); assert.equal(V.formatFileSize(2 * 1024 * 1024), "2.0 MB"); assert.equal(V.documentTypeLabel(null), "Not specified"); assert.equal(V.documentTypeLabel("cv"), "CV / Résumé"); assert.equal(V.formatFormatLabel(C.DOCX_MIME), "DOCX"); });
t("allowed formats mirror the DB/bucket allow-list exactly", () => { assert.deepEqual(C.ALLOWED_FORMATS.map((f) => f.mime).sort(), ["application/pdf", "image/jpeg", "image/png", C.DOCX_MIME].sort()); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
