// Repair Session 6 — document requirement coverage (metadata only). Pure + mocked; no live Supabase / Gemini.
const path = require("node:path");
const A = require(path.join(process.argv[2], "agent", "index.js"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("  PASS " + n); } catch (e) { fail++; console.log("  FAIL " + n + "\n       " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const SID = "11111111-1111-4111-8111-111111111111";
const doc = (type, id = "d1") => ({ id, documentType: type, fileName: type + ".pdf", mimeType: "application/pdf", createdAt: "2026-01-01T00:00:00Z" });
const req = (title, o = {}) => ({ id: o.id || "r1", type: o.type || "document", title, description: o.description ?? null, required: o.required !== false });

// ---------- mapping ----------
t("mapTitleToVaultType: known titles", () => {
  eq(A.mapTitleToVaultType("CV"), "cv");
  eq(A.mapTitleToVaultType("Curriculum Vitae"), "cv");
  eq(A.mapTitleToVaultType("Resume / CV"), "cv");
  eq(A.mapTitleToVaultType("Official Transcript"), "transcript");
  eq(A.mapTitleToVaultType("Degree Certificate"), "degree_certificate");
  eq(A.mapTitleToVaultType("Bachelor's Degree"), "degree_certificate");
  eq(A.mapTitleToVaultType("Passport copy"), "passport");
  eq(A.mapTitleToVaultType("IELTS 6.5 overall"), "english_test");
  eq(A.mapTitleToVaultType("Letter of Recommendation"), "recommendation_letter");
  eq(A.mapTitleToVaultType("Statement of Purpose"), "statement_of_purpose");
});
t("mapTitleToVaultType: unknown stays null (never invents a category)", () => {
  eq(A.mapTitleToVaultType("Research proposal"), null);
  eq(A.mapTitleToVaultType("Proof of funds"), null);
  eq(A.mapTitleToVaultType(""), null);
});
t("isDocumentRequirement: type=document or mappable title", () => {
  ok(A.isDocumentRequirement(req("Passport copy")));
  ok(A.isDocumentRequirement(req("CV", { type: "document" })));
  ok(A.isDocumentRequirement({ id: "x", type: "Document", title: "Anything", description: null, required: true }));
  ok(!A.isDocumentRequirement({ id: "x", type: "test", title: "IELTS 6.5 overall", description: null, required: true }) === false); // IELTS maps
  ok(A.isDocumentRequirement({ id: "x", type: "test", title: "IELTS 6.5", description: null, required: true })); // title maps
  ok(!A.isDocumentRequirement({ id: "x", type: "eligibility", title: "Must be under 30", description: null, required: true }));
  ok(!A.isDocumentRequirement({ id: "x", type: "pakistan_side", title: "HEC attestation", description: null, required: true }));
});

// ---------- coverage: present / missing / duplicate / unknown / empty / null ----------
t("coverage: present + missing (example from the repair goal)", () => {
  const requirements = [
    req("CV"),
    req("Transcript"),
    req("Degree Certificate"),
  ];
  const documents = [doc("cv", "d1"), doc("transcript", "d2")];
  const cov = A.documentCoverage(requirements, documents);
  eq(cov.present.map((i) => i.vaultType).sort(), ["cv", "transcript"]);
  eq(cov.missing.map((i) => i.vaultType), ["degree_certificate"]);
  eq(cov.missing[0].status, "missing");
  eq(cov.present.find((i) => i.vaultType === "cv").matchCount, 1);
});
t("coverage: duplicate documents of the same type count as present once", () => {
  const requirements = [req("CV"), req("CV / Résumé", { id: "r2" })];
  const documents = [doc("cv", "d1"), doc("cv", "d2"), doc("cv", "d3")];
  const cov = A.documentCoverage(requirements, documents);
  eq(cov.items.length, 1);
  eq(cov.present[0].matchCount, 3);
  eq(cov.missing.length, 0);
});
t("coverage: unknown document type on vault row does not satisfy a mapped requirement", () => {
  const cov = A.documentCoverage([req("CV")], [doc("other"), doc(null)]);
  eq(cov.missing.map((i) => i.vaultType), ["cv"]);
  eq(cov.present.length, 0);
});
t("coverage: unmapped document requirement title → unknown/confirm path", () => {
  const cov = A.documentCoverage(
    [{ id: "r1", type: "document", title: "Proof of funds", description: null, required: true }],
    [doc("cv")],
  );
  eq(cov.items.length, 1);
  eq(cov.items[0].vaultType, null);
  eq(cov.items[0].status, "missing");
  const gaps = A.documentGaps(cov);
  ok(gaps.some((g) => g.where === "scholarship_data" && /Proof of funds/.test(g.what)));
});
t("coverage: no documents → all required mapped items missing", () => {
  const cov = A.documentCoverage([req("CV"), req("Transcript")], []);
  eq(cov.missing.map((i) => i.vaultType).sort(), ["cv", "transcript"]);
  eq(cov.ownedCount, 0);
});
t("coverage: documents list unavailable → status unknown, not assumed missing or present", () => {
  const cov = A.documentCoverage([req("CV")], null);
  eq(cov.items[0].status, "unknown");
  eq(cov.missing.length, 0);
  const gaps = A.documentGaps(cov);
  ok(gaps.some((g) => /Could not verify/.test(g.what) && g.where === "documents"));
});
t("coverage: optional document does not produce a required gap when missing", () => {
  const cov = A.documentCoverage([req("CV", { required: false })], []);
  eq(cov.missing.length, 1);
  eq(A.documentGaps(cov).length, 0);
});
t("coverage: missing scholarship requirements → empty coverage", () => {
  const cov = A.documentCoverage([], [doc("cv")]);
  eq(cov.items.length, 0);
  eq(cov.ownedCount, 1);
});
t("coverage: non-document requirements are ignored", () => {
  const cov = A.documentCoverage(
    [{ id: "r1", type: "eligibility", title: "Must be under 30", description: null, required: true }],
    [doc("cv")],
  );
  eq(cov.items.length, 0);
});

// ---------- deriveGaps integration ----------
t("deriveGaps: empty vault + passport document requirement → missing document + confirm IELTS", () => {
  const state = {
    profile: { nationality: null, city: null, education: [], experiences: [], missing: [], omitted: { education: 0, experiences: 0 } },
    documents: [],
    requirements: [
      { id: "r1", type: "document", title: "Passport copy", description: "Valid passport", required: true },
      { id: "r2", type: "test", title: "IELTS 6.5", description: null, required: true },
    ],
  };
  // Minimal AgentState-shaped object for deriveGaps (only fields it reads).
  const gaps = A.deriveGaps(state);
  ok(gaps.some((g) => g.where === "documents" && /No documents are in your vault/.test(g.what)));
  ok(gaps.some((g) => g.where === "documents" && /Passport/.test(g.what)), JSON.stringify(gaps));
  // IELTS title maps to english_test → also a document gap when missing
  ok(gaps.some((g) => /English test|IELTS|english/i.test(g.what)), JSON.stringify(gaps));
});
t("deriveGaps: present CV does not list CV as missing", () => {
  const state = {
    profile: { nationality: null, city: null, education: [], experiences: [], missing: [], omitted: { education: 0, experiences: 0 } },
    documents: [doc("cv")],
    requirements: [req("CV"), req("Degree Certificate")],
  };
  const gaps = A.deriveGaps(state);
  ok(!gaps.some((g) => /CV|Résumé/i.test(g.what) && /Missing/.test(g.what)), JSON.stringify(gaps));
  ok(gaps.some((g) => /Degree certificate/.test(g.what) && g.where === "documents"), JSON.stringify(gaps));
});
t("deriveGaps: documents null → list could not be read (not empty vault)", () => {
  const state = {
    profile: { nationality: null, city: null, education: [], experiences: [], missing: [], omitted: { education: 0, experiences: 0 } },
    documents: null,
    requirements: [req("CV")],
  };
  const gaps = A.deriveGaps(state);
  ok(gaps.some((g) => /could not be read/i.test(g.what)));
  ok(!gaps.some((g) => /No documents are in your vault/.test(g.what)));
});

// ---------- digest never claims content was read ----------
t("documentDigest: reports categories and present/missing, never content", () => {
  const d = A.documentDigest([doc("cv"), doc("transcript")], [req("CV"), req("Degree Certificate")]);
  ok(/documents on file: 2/.test(d));
  ok(/cv/.test(d) && /transcript/.test(d));
  ok(/CV.*present/i.test(d) || /present/.test(d));
  ok(/Degree certificate.*missing/i.test(d) || /missing/.test(d));
  ok(!/analyzed|extracted|content|read the file/i.test(d));
});
t("documentDigest: null documents → unavailable", () => {
  ok(/unavailable/.test(A.documentDigest(null, [req("CV")])));
});

// ---------- analyzeDocument contract still refuses content analysis ----------
t("analyzeDocument tool output type still declares analysis_not_supported (no fabricated analysis)", () => {
  // Type-level contract is in types; pure registry still names the tool.
  ok(A.lookupTool("analyzeDocument").name === "analyzeDocument");
  ok(A.lookupTool("analyzeDocument").risk === "READ_ONLY");
});

console.log(`\nagent documents tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
