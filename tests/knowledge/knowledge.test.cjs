// Module 11 unit tests. Pure functions + MOCKED I/O (fetch, DNS, embedding provider, store).
// Nothing here talks to Supabase or Gemini; do not report these as live verification.
const path = require("node:path");
const out = process.argv[2];
const K = require(path.join(out, "index.js"));
const U = require(path.join(out, "url-safety.js"));

let pass = 0, fail = 0; const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const ok = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const PUBLIC = async () => ["93.184.216.34"];
const body = (bytes) => { let sent = false; return { getReader: () => ({ read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })), cancel: async () => {} }) }; };
const resp = (status, headers, text) => ({ status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, body: text === undefined ? null : body(typeof text === "string" ? new TextEncoder().encode(text) : text) });
const html = (text, extra = {}) => resp(200, { "content-type": "text/html; charset=utf-8", ...extra }, text);

// ---------------------------------------------------------------- URL validation
t("URL: rejects non-http(s) protocols", () => { for (const u of ["ftp://example.org/a", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "gopher://example.org"]) ok(!K.parseSourceUrl(u).ok, u); });
t("URL: rejects non-strings, empty, whitespace/control chars, over-long", () => {
  for (const u of [null, undefined, 5, {}, "", "   ", "https://exa mple.org", "https://example.org/a\nb", "https://example.org/a\u0000b", "https://example.org/" + "a".repeat(2100)]) ok(!K.parseSourceUrl(u).ok, String(u).slice(0, 30));
});
t("URL: rejects embedded credentials and non-standard ports", () => {
  ok(!K.parseSourceUrl("https://user:pw@example.org/").ok); ok(!K.parseSourceUrl("https://example.org:8080/").ok); ok(!K.parseSourceUrl("http://example.org:22/").ok);
  ok(K.parseSourceUrl("https://example.org:443/x").ok); ok(K.parseSourceUrl("http://example.org/x").ok);
});
t("URL: rejects localhost and internal-looking hostnames", () => {
  for (const u of ["http://localhost/", "http://localhost./", "http://app.localhost/", "http://printer.local/", "http://db.internal/", "http://intranet/", "https://router.lan/"]) ok(!K.parseSourceUrl(u).ok, u);
});
t("URL: rejects private, loopback, link-local, metadata and reserved IPv4 literals (incl. obfuscated forms)", () => {
  for (const u of ["http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.0.1/", "http://172.31.255.255/", "http://169.254.169.254/latest/meta-data", "http://0.0.0.0/", "http://100.64.0.1/", "http://224.0.0.1/", "http://255.255.255.255/",
    "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://127.1/"]) ok(!K.parseSourceUrl(u).ok, u);
});
t("URL: rejects private/loopback/mapped IPv6 literals", () => {
  for (const u of ["http://[::1]/", "http://[::]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:10.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[2001:db8::1]/", "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::]/"]) ok(!K.parseSourceUrl(u).ok, u);
});
t("URL: accepts public hosts and public IP literals (172.32/8 and 100.63/8 are public)", () => {
  for (const u of ["https://example.org/path?q=1", "http://8.8.8.8/", "http://172.32.0.1/", "http://100.63.0.1/", "https://[2606:4700:4700::1111]/", "https://scholarships.example.co.uk/a"]) ok(K.parseSourceUrl(u).ok, u);
});
t("URL: isBlockedIp fails closed on garbage", () => { for (const a of ["", "abc", "1.2.3", "999.1.1.1", "::g"]) ok(U.isBlockedIp(a), a); });
t("DNS: hostname resolving to a private address is blocked; any private among several blocks", async () => {
  eq((await K.assertPublicUrl("https://evil.example.org/", async () => ["10.0.0.1"])).code, "blocked_url");
  eq((await K.assertPublicUrl("https://evil.example.org/", async () => ["93.184.216.34", "127.0.0.1"])).code, "blocked_url");
  eq((await K.assertPublicUrl("https://evil.example.org/", async () => ["::1"])).code, "blocked_url");
});
t("DNS: failure or empty answer -> dns_failed; public answer ok; literal IPs skip DNS", async () => {
  eq((await K.assertPublicUrl("https://x.example.org/", async () => { throw new Error("nx"); })).code, "dns_failed");
  eq((await K.assertPublicUrl("https://x.example.org/", async () => [])).code, "dns_failed");
  ok((await K.assertPublicUrl("https://x.example.org/", PUBLIC)).ok);
  let called = false; ok((await K.assertPublicUrl("http://8.8.8.8/", async () => { called = true; return []; })).ok); ok(!called);
});

// ---------------------------------------------------------------- Safe fetch (security)
t("fetch: returns text for an allowed content type; sends no cookies/credentials; redirect=manual", async () => {
  const calls = [];
  const r = await K.fetchSource("https://example.org/a", { resolve: PUBLIC, fetch: async (u, init) => { calls.push([u, init]); return html("<p>hello</p>"); } });
  ok(r.ok && r.value.text === "<p>hello</p>" && r.value.contentType === "text/html", JSON.stringify(r));
  const h = Object.keys(calls[0][1].headers).map((x) => x.toLowerCase());
  ok(!h.includes("cookie") && !h.includes("authorization"), "credentials header"); eq(calls[0][1].redirect, "manual");
});
t("fetch: unsupported protocol / localhost / private IP rejected BEFORE any request", async () => {
  let n = 0; const f = async () => { n++; return html("x"); };
  for (const u of ["ftp://example.org/", "http://localhost/", "http://169.254.169.254/", "http://10.1.1.1/"]) ok(!(await K.fetchSource(u, { resolve: PUBLIC, fetch: f })).ok, u);
  eq(n, 0, "network was touched");
});
t("fetch: a redirect to a private IP / localhost / metadata endpoint is blocked and NEVER requested", async () => {
  for (const target of ["http://127.0.0.1/admin", "http://localhost/", "http://169.254.169.254/latest", "http://[::1]/", "ftp://example.org/x"]) {
    const requested = [];
    const r = await K.fetchSource("https://example.org/a", { resolve: PUBLIC, fetch: async (u) => { requested.push(u); return resp(302, { location: target }, ""); } });
    ok(!r.ok && (r.code === "blocked_url" || r.code === "invalid_url"), `${target}: ${JSON.stringify(r)}`); eq(requested.length, 1, `${target} was requested`);
  }
});
t("fetch: a redirect to a hostname that RESOLVES to a private IP is blocked", async () => {
  const resolve = async (h) => (h === "rebind.example.org" ? ["192.168.0.10"] : ["93.184.216.34"]);
  const requested = [];
  const r = await K.fetchSource("https://example.org/a", { resolve, fetch: async (u) => { requested.push(u); return resp(301, { location: "https://rebind.example.org/x" }, ""); } });
  eq(r.code, "blocked_url"); eq(requested.length, 1);
});
t("fetch: relative redirects are followed and re-validated; redirect loops stop", async () => {
  let i = 0; const r1 = await K.fetchSource("https://example.org/a", { resolve: PUBLIC, fetch: async (u) => (i++ === 0 ? resp(302, { location: "/b" }, "") : html("ok")) });
  ok(r1.ok && r1.value.finalUrl === "https://example.org/b", JSON.stringify(r1));
  const r2 = await K.fetchSource("https://example.org/a", { resolve: PUBLIC, fetch: async () => resp(302, { location: "/loop" }, "") });
  eq(r2.code, "too_many_redirects");
});
t("fetch: redirect without Location -> http_error", async () => eq((await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => resp(302, {}, "") })).code, "http_error"));
t("fetch: non-2xx -> http_error", async () => { for (const s of [404, 500, 403]) eq((await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => resp(s, { "content-type": "text/html" }, "x") })).code, "http_error"); });
t("fetch: unsupported content types rejected (pdf, json, image, octet-stream, missing)", async () => {
  for (const ct of ["application/pdf", "application/json", "image/png", "application/octet-stream", undefined]) {
    const r = await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => resp(200, ct ? { "content-type": ct } : {}, "x") });
    eq(r.code, "unsupported_content_type", String(ct));
  }
});
t("fetch: oversized responses rejected (declared length and streamed without a length)", async () => {
  eq((await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => html("x", { "content-length": String(K.KNOWLEDGE_CONFIG.fetch.maxResponseBytes + 1) }) })).code, "response_too_large");
  const big = new Uint8Array(K.KNOWLEDGE_CONFIG.fetch.maxResponseBytes + 1);
  eq((await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => html(big) })).code, "response_too_large");
});
t("fetch: response exactly at the limit is accepted", async () => {
  const exact = new Uint8Array(K.KNOWLEDGE_CONFIG.fetch.maxResponseBytes).fill(97);
  ok((await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => html(exact) })).ok);
});
t("fetch: timeout while waiting for headers and while reading the body -> fetch_timeout", async () => {
  const hang = (signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
  eq((await K.fetchSource("https://example.org/", { resolve: PUBLIC, timeoutMs: 20, fetch: async (_u, init) => hang(init.signal) })).code, "fetch_timeout");
  const slow = async (_u, init) => ({ status: 200, headers: { get: (k) => (k.toLowerCase() === "content-type" ? "text/html" : null) }, body: { getReader: () => ({ read: () => hang(init.signal), cancel: async () => {} }) } });
  eq((await K.fetchSource("https://example.org/", { resolve: PUBLIC, timeoutMs: 20, fetch: slow })).code, "fetch_timeout");
});
t("fetch: network error -> fetch_failed; malformed/empty body handled", async () => {
  eq((await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => { throw new Error("ECONNRESET secret-token"); } })).code, "fetch_failed");
  eq((await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => resp(200, { "content-type": "text/html" }) })).code, "empty_content");
  const r = await K.fetchSource("https://example.org/", { resolve: PUBLIC, fetch: async () => resp(200, { "content-type": "text/html; charset=nonsense" }, new Uint8Array([0xff, 0xfe, 0x41])) });
  ok(r.ok, "bad charset must fall back, not throw");
});

// ---------------------------------------------------------------- Normalization / extraction
t("normalize: collapses whitespace, removes zero-width + control chars, unifies newlines; idempotent", () => {
  const raw = "  Hello\u00A0\u00A0world\u200B \r\n\r\n\r\n\r\nLine\u0007 two\t\tend  ";
  const n = K.normalizeText(raw); eq(n, "Hello world\n\nLine two end"); eq(K.normalizeText(n), n);
});
t("extract: html -> title, headings become sections, boilerplate/script/style removed", () => {
  const r = K.extractText("text/html", `<html><head><title>Prog &amp; Co</title><style>.x{}</style></head><body><nav>MENU</nav><script>evil()</script>
    <h1>Overview</h1><p>Intro text.</p><h2>Eligibility</h2><p>Must hold a <b>Bachelor</b> degree.</p><ul><li>GPA 3.0</li></ul><footer>FOOT</footer></body></html>`);
  ok(r.ok); eq(r.value.title, "Prog & Co");
  eq(r.value.blocks.map((b) => b.section), ["Overview", "Eligibility"]);
  const all = r.value.blocks.map((b) => b.text).join(" ");
  ok(/Intro text/.test(all) && /Bachelor degree/.test(all) && /GPA 3\.0/.test(all)); ok(!/MENU|FOOT|evil|\.x\{/.test(all), all);
});
t("extract: entities decoded; invalid numeric entities dropped; unknown named entities left as-is", () => {
  eq(K.decodeEntities("a&nbsp;b &amp;lt; &#65; &#x42; &#0; &#xD800; &#1114112; &#99999999; &bogus;"), "a b &lt; A B    &#99999999; &bogus;");
});
t("extract: marker characters in input cannot forge sections", () => {
  const r = K.extractText("text/html", "<p>before \u0001Fake Heading\u0002 after</p>");
  ok(r.ok); ok(r.value.blocks.every((b) => b.section === null), "forged section");
});
t("extract: text/plain ok; unsupported type (pdf) rejected; empty/whitespace-only rejected; too-large rejected", () => {
  ok(K.extractText("text/plain", "Some  text\n\nmore").ok);
  eq(K.extractText("application/pdf", "%PDF-1.4").code, "unsupported_content_type");
  eq(K.extractText("text/html", "<html><script>x</script></html>").code, "empty_content");
  eq(K.extractText("text/plain", "   \n ").code, "empty_content");
  eq(K.extractText("text/plain", "a".repeat(K.KNOWLEDGE_CONFIG.extract.maxExtractedChars + 1)).code, "content_too_large");
});

// ---------------------------------------------------------------- Chunking
const sample = [{ section: "Overview", text: Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(60)).join("\n\n") }, { section: "Deadline", text: "Closes 1 March." }];
t("chunk: deterministic (same input + config -> identical chunks and hashes)", () => { eq(K.chunkBlocks(sample), K.chunkBlocks(JSON.parse(JSON.stringify(sample)))); });
t("chunk: sequential index, section kept, never crosses sections, size within maxChars", () => {
  const r = K.chunkBlocks(sample); ok(r.ok);
  r.value.forEach((c, i) => { eq(c.index, i); ok(c.content.length <= K.KNOWLEDGE_CONFIG.chunking.maxChars, `chunk ${i} too big`); });
  ok(r.value.some((c) => c.section === "Overview") && r.value.some((c) => c.section === "Deadline"));
  ok(r.value.filter((c) => c.section === "Deadline").every((c) => !/Paragraph/.test(c.content)), "crossed sections");
});
t("chunk: metadata (chunking version, char count, null page number, sha256 of content)", () => {
  const c = K.chunkBlocks([{ section: null, text: "Closes 1 March 2027 for all applicants worldwide, see the official notice." }]).value[0];
  eq(c.metadata.chunking_version, K.KNOWLEDGE_CONFIG.chunking.version); eq(c.metadata.char_count, c.content.length); eq(c.pageNumber, null);
  eq(c.contentHash, K.sha256(c.content)); ok(/^[0-9a-f]{64}$/.test(c.contentHash));
});
t("chunk: oversized paragraph is window-split with overlap and loses no words", () => {
  const words = Array.from({ length: 800 }, (_, i) => `w${i}`); const r = K.chunkBlocks([{ section: null, text: words.join(" ") }]); ok(r.ok && r.value.length > 1);
  const seen = new Set(r.value.flatMap((c) => c.content.split(" "))); ok(words.every((w) => seen.has(w)), "word lost");
  const a = r.value[0].content.split(" "), b = r.value[1].content.split(" "); ok(a.slice(-3).some((w) => b.includes(w)), "no overlap");
  r.value.forEach((c) => ok(c.content.length <= K.KNOWLEDGE_CONFIG.chunking.maxChars));
});
t("chunk: short facts are kept (never dropped) and tiny trailing fragments merge into the previous chunk", () => {
  const r = K.chunkBlocks([{ section: "Dates", text: "Deadline: 1 March." }]); eq(r.value.length, 1); eq(r.value[0].content, "Deadline: 1 March.");
  const m = K.chunkBlocks([{ section: "S", text: "x".repeat(950) + "\n\n" + "y".repeat(40) }]).value; eq(m.length, 1);
});
t("chunk: empty input -> empty_content; too many chunks -> too_many_chunks (not silent truncation)", () => {
  eq(K.chunkBlocks([]).code, "empty_content");
  eq(K.chunkBlocks(sample, { maxChunksPerDocument: 2 }).code, "too_many_chunks");
});
t("chunk: embeddingInput adds title/section context but stored content is untouched", () => {
  eq(K.embeddingInput("T", { section: "S", content: "C" }), "T\nS\nC"); eq(K.embeddingInput(null, { section: null, content: "C" }), "C");
});

// ---------------------------------------------------------------- Embeddings
t("embedding validation: wrong length, NaN, Infinity, non-number, all-zero, non-array rejected", () => {
  const good = Array.from({ length: 4 }, (_, i) => i + 1); ok(K.validateEmbedding(good, 4));
  for (const bad of [[1, 2, 3], [1, 2, 3, NaN], [1, 2, 3, Infinity], [1, 2, 3, "4"], [0, 0, 0, 0], null, "x", { length: 4 }, [1, 2, 3, null]]) ok(!K.validateEmbedding(bad, 4), JSON.stringify(bad));
});
t("l2Normalize yields unit length; zero vector stays zero", () => {
  const n = K.l2Normalize([3, 4]); ok(Math.abs(Math.hypot(...n) - 1) < 1e-12); eq(K.l2Normalize([0, 0]), [0, 0]);
});
const vecOf = (seed) => Array.from({ length: 768 }, (_, i) => ((i + seed) % 7) + 1);
const gem = (http, key = "TEST-KEY-123") => new K.GeminiEmbeddingProvider(key, http);
const okHttp = (calls) => async (url, init) => { calls.push([url, init]); const b = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ embedding: { values: vecOf(b.content.parts[0].text.length) } }) }; };
t("gemini: documented model/dimension/task type, key only in header, never in URL or body", async () => {
  const calls = []; const p = gem(okHttp(calls));
  eq(p.model, "gemini-embedding-001"); eq(p.dimensions, 768);
  const r = await p.embed(["doc text"], "document"); ok(r.ok && r.vectors.length === 1 && r.vectors[0].length === 768);
  const [url, init] = calls[0]; const b = JSON.parse(init.body);
  ok(url.endsWith("/models/gemini-embedding-001:embedContent")); eq(b.taskType, "RETRIEVAL_DOCUMENT"); eq(b.outputDimensionality, 768); eq(b.model, "models/gemini-embedding-001");
  eq(init.headers["x-goog-api-key"], "TEST-KEY-123"); ok(!url.includes("TEST-KEY") && !init.body.includes("TEST-KEY"));
  await p.embed(["q"], "query"); eq(JSON.parse(calls[1][1].body).taskType, "RETRIEVAL_QUERY");
});
t("gemini: vectors are L2-normalized and returned in input order even with concurrency", async () => {
  const texts = Array.from({ length: 11 }, (_, i) => "t".repeat(i + 1)); const calls = [];
  const delayed = async (u, init) => { await new Promise((r) => setTimeout(r, Math.random() * 5)); return okHttp(calls)(u, init); };
  const r = await gem(delayed).embed(texts, "document"); ok(r.ok);
  r.vectors.forEach((v, i) => { ok(Math.abs(Math.hypot(...v) - 1) < 1e-9); const exp = K.l2Normalize(vecOf(i + 1)); ok(Math.abs(v[0] - exp[0]) < 1e-12, `order ${i}`); });
});
t("gemini: missing key -> embedding_unavailable without any request; 401/403 -> unavailable; 5xx/429/throw -> failed", async () => {
  let n = 0; const http = async () => { n++; };
  for (const key of ["", undefined]) eq((await new K.GeminiEmbeddingProvider(key, http).embed(["x"], "query")).code, "embedding_unavailable"); eq(n, 0);
  for (const [s, code] of [[401, "embedding_unavailable"], [403, "embedding_unavailable"], [500, "embedding_failed"], [429, "embedding_failed"]]) eq((await gem(async () => ({ ok: false, status: s, json: async () => ({}) })).embed(["x"], "query")).code, code, String(s));
  eq((await gem(async () => { throw new Error("boom TEST-KEY-123"); }).embed(["x"], "query")).code, "embedding_failed");
});
t("gemini: malformed responses rejected (wrong dimension, missing values, NaN, non-JSON) as embedding_invalid/failed", async () => {
  const mk = (data) => gem(async () => ({ ok: true, status: 200, json: async () => data }));
  for (const data of [{ embedding: { values: [1, 2, 3] } }, { embedding: {} }, {}, null, { embedding: { values: Array(768).fill(NaN) } }, { embedding: { values: Array(768).fill(0) } }]) eq((await mk(data).embed(["x"], "query")).code, "embedding_invalid", JSON.stringify(data)?.slice(0, 40));
  eq((await gem(async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } })).embed(["x"], "query")).code, "embedding_failed");
});
t("gemini: empty list / blank text -> embedding_invalid; failure outcome never contains the key", async () => {
  eq((await gem(okHttp([])).embed([], "document")).code, "embedding_invalid"); eq((await gem(okHttp([])).embed(["  "], "document")).code, "embedding_invalid");
  const r = await gem(async () => { throw new Error("TEST-KEY-123"); }).embed(["x"], "query"); ok(!JSON.stringify(r).includes("TEST-KEY"));
});

// ---------------------------------------------------------------- Eligibility
const NOW = new Date("2026-10-02T00:00:00Z");
const src = (o = {}) => ({ id: "s1", scholarshipId: "sc1", scholarshipStatus: "active", sourceUrl: "https://example.org/a", sourceName: "N", sourceType: "whatever", priority: 3, lastVerifiedAt: "2026-09-01T00:00:00Z", active: true, ...o });
t("eligibility: active + verified + active scholarship + safe URL -> eligible", () => ok(K.evaluateSourceEligibility(src(), NOW).eligible));
t("eligibility: each failing condition names its reason (never verified != verified; future date != verified)", () => {
  const r = (o) => K.evaluateSourceEligibility(src(o), NOW).reason;
  eq(r({ active: false }), "source_inactive"); eq(r({ scholarshipStatus: "draft" }), "scholarship_not_active"); eq(r({ scholarshipStatus: "archived" }), "scholarship_not_active"); eq(r({ scholarshipStatus: null }), "scholarship_not_active");
  eq(r({ lastVerifiedAt: null }), "never_verified"); eq(r({ lastVerifiedAt: "" }), "never_verified");
  eq(r({ lastVerifiedAt: "2099-01-01T00:00:00Z" }), "invalid_verified_date"); eq(r({ lastVerifiedAt: "not a date" }), "invalid_verified_date");
  eq(r({ sourceUrl: "http://127.0.0.1/x" }), "invalid_source_url"); eq(r({ sourceUrl: "ftp://example.org" }), "invalid_source_url");
});
t("eligibility: source_type/priority never influence the decision (no silent upgrade or downgrade)", () => {
  for (const sourceType of [null, "official_provider", "forum", "totally unknown"]) ok(K.evaluateSourceEligibility(src({ sourceType }), NOW).eligible, String(sourceType));
});

// ---------------------------------------------------------------- Pipeline (mock store/embedder/fetch)
const PAGE = "<html><head><title>Prog</title></head><body><h1>Overview</h1><p>" + "Open to students from Pakistan. ".repeat(10) + "</p><h2>Deadline</h2><p>Closes 1 March.</p></body></html>";
function harness(o = {}) {
  const log = { began: 0, failed: [], unchanged: 0, replaced: [], embedCalls: 0, fetched: [] };
  const store = {
    getSource: async () => ("source" in o ? o.source : src()),
    getDocumentState: async () => o.doc ?? null,
    beginAttempt: async () => { log.began++; return o.beginFails ? null : { documentId: "d1" }; },
    markFailed: async (id, code) => { log.failed.push(code); }, markUnchanged: async () => { log.unchanged++; },
    replaceChunks: async (i) => { log.replaced.push(i); return o.persistOk !== false; },
  };
  const embedder = { model: o.model ?? "gemini-embedding-001", dimensions: 768, embed: async (texts) => { log.embedCalls++; if (o.embedResult) return o.embedResult(texts); return { ok: true, vectors: texts.map((_, i) => vecOf(i)) }; } };
  const deps = { store, embedder, now: () => NOW, fetchSource: async (u) => { log.fetched.push(u); return o.fetchResult ?? { ok: true, value: { finalUrl: u, contentType: "text/html", text: o.page ?? PAGE, bytes: 1 } }; } };
  return { deps, log };
}
t("pipeline: happy path stores chunks WITH embeddings, section metadata and version 1; status ready", async () => {
  const { deps, log } = harness(); const r = await K.ingestSource("s1", deps);
  eq(r.status, "ready"); ok(r.chunkCount >= 2); eq(log.replaced.length, 1);
  const i = log.replaced[0]; eq(i.version, 1); eq(i.title, "Prog"); eq(i.embeddingModel, "gemini-embedding-001"); eq(i.embeddingDimensions, 768); eq(i.chunkingVersion, K.KNOWLEDGE_CONFIG.chunking.version);
  ok(i.chunks.every((c) => c.embedding.length === 768)); ok(i.chunks.some((c) => c.section === "Deadline")); ok(/^[0-9a-f]{64}$/.test(i.contentHash)); eq(log.failed.length, 0);
});
t("pipeline: ineligible sources are skipped BEFORE any fetch or write (unverified, inactive, draft, future date, bad URL)", async () => {
  for (const [o, reason] of [[{ lastVerifiedAt: null }, "never_verified"], [{ active: false }, "source_inactive"], [{ scholarshipStatus: "draft" }, "scholarship_not_active"], [{ lastVerifiedAt: "2099-01-01" }, "invalid_verified_date"], [{ sourceUrl: "http://10.0.0.1/" }, "invalid_source_url"]]) {
    const { deps, log } = harness({ source: src(o) }); const r = await K.ingestSource("s1", deps);
    eq(r, { status: "skipped", reason }); eq(log.began + log.fetched.length + log.embedCalls + log.replaced.length, 0, reason);
  }
});
t("pipeline: unknown source id -> skipped(source_not_found)", async () => { const { deps } = harness({ source: null }); eq(await K.ingestSource("x", deps), { status: "skipped", reason: "source_not_found" }); });
t("pipeline: concurrent attempt is skipped; a stale 'processing' row is retried", async () => {
  const recent = new Date(NOW.getTime() - 60_000).toISOString(), stale = new Date(NOW.getTime() - 3_600_000).toISOString();
  const base = { id: "d1", processingStatus: "processing", contentHash: null, version: 1, chunkingVersion: null, embeddingModel: null, embeddingDimensions: null };
  eq((await K.ingestSource("s1", harness({ doc: { ...base, lastAttemptAt: recent } }).deps)).reason, "already_processing");
  eq((await K.ingestSource("s1", harness({ doc: { ...base, lastAttemptAt: stale } }).deps)).status, "ready");
});
t("pipeline: re-ingesting identical content is 'unchanged' (no embedding calls, no rewrite); changed content bumps version", async () => {
  const first = harness(); await K.ingestSource("s1", first.deps); const saved = first.log.replaced[0];
  const doc = { id: "d1", processingStatus: "ready", contentHash: saved.contentHash, version: 1, chunkingVersion: saved.chunkingVersion, embeddingModel: saved.embeddingModel, embeddingDimensions: 768, lastAttemptAt: null };
  const same = harness({ doc }); eq(await K.ingestSource("s1", same.deps), { status: "unchanged" }); eq(same.log.embedCalls + same.log.replaced.length, 0); eq(same.log.unchanged, 1);
  const changed = harness({ doc, page: PAGE.replace("1 March", "1 April") }); eq((await K.ingestSource("s1", changed.deps)).status, "ready"); eq(changed.log.replaced[0].version, 2);
  const newModel = harness({ doc, model: "other-model" }); eq((await K.ingestSource("s1", newModel.deps)).status, "ready");
});
t("pipeline: fetch / extraction failures -> failed with a safe CODE; no embedding or persistence attempted", async () => {
  for (const code of ["blocked_url", "response_too_large", "unsupported_content_type", "fetch_timeout"]) {
    const { deps, log } = harness({ fetchResult: { ok: false, code } }); eq(await K.ingestSource("s1", deps), { status: "failed", code }); eq(log.failed, [code]); eq(log.embedCalls + log.replaced.length, 0);
  }
  const pdf = harness({ fetchResult: { ok: true, value: { finalUrl: "u", contentType: "application/pdf", text: "%PDF", bytes: 4 } } }); eq((await K.ingestSource("s1", pdf.deps)).code, "unsupported_content_type");
  const empty = harness({ page: "<html><script>x</script></html>" }); eq((await K.ingestSource("s1", empty.deps)).code, "empty_content");
});
t("pipeline: embedding failures (unavailable/failed/count mismatch/bad vector) -> failed, nothing persisted", async () => {
  const cases = [[() => ({ ok: false, code: "embedding_unavailable" }), "embedding_unavailable"], [() => ({ ok: false, code: "embedding_failed" }), "embedding_failed"],
    [(t) => ({ ok: true, vectors: [vecOf(1)] }), "embedding_invalid"], [(t) => ({ ok: true, vectors: t.map(() => [1, 2, 3]) }), "embedding_invalid"], [(t) => ({ ok: true, vectors: t.map(() => Array(768).fill(NaN)) }), "embedding_invalid"]];
  for (const [fn, code] of cases) { const { deps, log } = harness({ embedResult: fn }); eq((await K.ingestSource("s1", deps)).code, code); eq(log.replaced.length, 0); eq(log.failed, [code]); }
});
t("pipeline: persistence failure -> failed(persist_failed); begin failure -> failed(persist_failed) without fetching", async () => {
  const a = harness({ persistOk: false }); eq((await K.ingestSource("s1", a.deps)).code, "persist_failed"); eq(a.log.failed, ["persist_failed"]);
  const b = harness({ beginFails: true }); eq((await K.ingestSource("s1", b.deps)).code, "persist_failed"); eq(b.log.fetched.length, 0);
});
t("pipeline: the only error text ever stored is a short snake_case code", async () => {
  const { deps, log } = harness({ fetchResult: { ok: false, code: "fetch_failed" } }); await K.ingestSource("s1", deps);
  ok(log.failed.every((c) => /^[a-z0-9_]{1,64}$/.test(c)));
});

// ---------------------------------------------------------------- Retrieval
const row = (o = {}) => ({ chunk_id: "c1", knowledge_document_id: "d1", scholarship_id: "sc1", source_id: "s1", source_url: "https://example.org/a", source_name: "Src", source_type: "random free text", source_priority: 2, source_last_verified_at: "2026-09-01T00:00:00Z", document_title: "T", section: "Deadline", page_number: null, chunk_index: 3, content: "Closes 1 March.", similarity: 0.8123, ...o });
const retr = (rows, o = {}) => ({ embedder: { model: "m", dimensions: 768, embed: async (t) => o.embed ?? { ok: true, vectors: [vecOf(1)] } }, store: { matchChunks: async (a) => { if (o.spy) o.spy.push(a); if (o.throws) throw new Error("db"); return rows; } } });
t("retrieval input validation: non-string, too short/long, bad limit/scholarshipId/minSimilarity rejected", () => {
  for (const i of [{ query: 5 }, { query: null }, {}, { query: "ab" }, { query: "   " }, { query: "x".repeat(501) }, { query: "valid query", limit: 0 }, { query: "valid query", limit: 21 }, { query: "valid query", limit: 1.5 }, { query: "valid query", limit: "3" },
    { query: "valid query", scholarshipId: "not-a-uuid" }, { query: "valid query", scholarshipId: 7 }, { query: "valid query", minSimilarity: 2 }, { query: "valid query", minSimilarity: NaN }, { query: "valid query", minSimilarity: "0.5" }]) ok(!K.validateRetrievalInput(i).ok, JSON.stringify(i).slice(0, 60));
});
t("retrieval input: defaults + normalization (whitespace/control chars, uuid case)", () => {
  const v = K.validateRetrievalInput({ query: "  What is\u0007  the   deadline? " }); ok(v.ok); eq(v.query, "What is the deadline?"); eq(v.limit, 8); eq(v.scholarshipId, null); eq(v.minSimilarity, null);
  eq(K.validateRetrievalInput({ query: "valid query", scholarshipId: "ABCDEF12-3456-7890-ABCD-EF1234567890" }).scholarshipId, "abcdef12-3456-7890-abcd-ef1234567890");
});
t("retrieval: returns chunks with source + scholarship references; type recorded as-is; raw similarity; passes filters to the store", async () => {
  const spy = []; const sid = "abcdef12-3456-7890-abcd-ef1234567890";
  const r = await K.retrieveKnowledge({ query: "when is the deadline", limit: 5, scholarshipId: sid }, retr([row({ scholarship_id: sid })], { spy }));
  ok(r.ok); const c = r.chunks[0]; eq(c.source, { id: "s1", url: "https://example.org/a", name: "Src", type: "random free text", priority: 2, lastVerifiedAt: "2026-09-01T00:00:00Z" });
  eq(c.scholarshipId, sid); eq(c.section, "Deadline"); eq(c.chunkIndex, 3); eq(c.similarity, 0.8123);
  eq(spy[0].limit, 5); eq(spy[0].scholarshipId, sid); eq(spy[0].embedding.length, 768);
  ok(!/official|verified":true|confidence|probab/i.test(JSON.stringify(Object.keys(c))), "unexpected claim field");
});
t("retrieval: scopes to the requested scholarship — other/null ids dropped (case-insensitive)", async () => {
  const sid = "abcdef12-3456-7890-abcd-ef1234567890"; const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const rows = [
    row({ chunk_id: "keep", scholarship_id: sid.toUpperCase(), content: "Deadline is March." }),
    row({ chunk_id: "other", scholarship_id: other, content: "OTHER-SCHOLARSHIP-SECRET" }),
    row({ chunk_id: "nul", scholarship_id: null, content: "NULL-SCHOLARSHIP-TEXT" }),
  ];
  const r = await K.retrieveKnowledge({ query: "when is the deadline", scholarshipId: sid }, retr(rows));
  ok(r.ok); eq(r.chunks.map((c) => c.chunkId), ["keep"]);
  ok(!JSON.stringify(r.chunks).includes("OTHER-SCHOLARSHIP-SECRET"));
  ok(!JSON.stringify(r.chunks).includes("NULL-SCHOLARSHIP-TEXT"));
  ok(K.chunkBelongsToScholarship({ scholarshipId: sid.toUpperCase() }, sid));
  ok(!K.chunkBelongsToScholarship({ scholarshipId: other }, sid));
  ok(!K.chunkBelongsToScholarship({ scholarshipId: null }, sid));
});
t("retrieval: without scholarship filter, rows are returned as mapped (callers must scope)", async () => {
  const r = await K.retrieveKnowledge({ query: "when is the deadline" }, retr([row({ chunk_id: "a", scholarship_id: "sc-a" }), row({ chunk_id: "b", scholarship_id: "sc-b" })]));
  ok(r.ok); eq(r.chunks.map((c) => c.chunkId).sort(), ["a", "b"]);
});
t("retrieval: empty results -> ok with []; null rows / store throws -> search_failed", async () => {
  eq(await K.retrieveKnowledge({ query: "anything here" }, retr([])), { ok: true, chunks: [] });
  eq((await K.retrieveKnowledge({ query: "anything here" }, retr(null))).code, "search_failed"); eq((await K.retrieveKnowledge({ query: "anything here" }, retr([], { throws: true }))).code, "search_failed");
});
t("retrieval: provider failures are mapped (unavailable vs failed vs malformed vector) and never reach the store", async () => {
  eq((await K.retrieveKnowledge({ query: "anything here" }, retr([row()], { embed: { ok: false, code: "embedding_unavailable" } }))).code, "embedding_unavailable");
  eq((await K.retrieveKnowledge({ query: "anything here" }, retr([row()], { embed: { ok: false, code: "embedding_failed" } }))).code, "search_failed");
  const spy = []; eq((await K.retrieveKnowledge({ query: "anything here" }, retr([row()], { embed: { ok: true, vectors: [[1, 2]] }, spy }))).code, "search_failed"); eq(spy.length, 0);
  eq((await K.retrieveKnowledge({ query: "x" }, retr([row()]))).code, "invalid_query");
});
t("retrieval: malformed/unsafe rows are dropped (non-http source URL, missing content/source, non-finite similarity); result count capped by limit", async () => {
  const rows = [row({ source_url: "javascript:alert(1)" }), row({ content: "" }), row({ source_id: null }), row({ similarity: NaN }), row({ similarity: "0.9" }), row({ chunk_id: "ok1" }), row({ chunk_id: "ok2" }), row({ chunk_id: "ok3" })];
  const r = await K.retrieveKnowledge({ query: "anything here", limit: 2 }, retr(rows)); ok(r.ok); eq(r.chunks.map((c) => c.chunkId), ["ok1", "ok2"]);
});

(async () => {
  for (const [name, fn] of queue) { try { await fn(); pass++; console.log("  PASS", name); } catch (e) { fail++; console.log("  FAIL", name, "-", e.message); } }
  console.log(`\nknowledge unit tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
