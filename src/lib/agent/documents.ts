/**
 * Document requirement coverage for the agent (Repair Session 6). PURE: no I/O, no Supabase.
 *
 * The vault stores only metadata (`document_type`, file name, mime, size, created_at). There is
 * no content-extraction pipeline, so the agent can only say whether a *category* of document is
 * present in the student's vault — never what the file contains.
 *
 * Matching is deterministic:
 *  - A scholarship requirement is treated as a document requirement when its `type` normalises to
 *    "document", or when its title maps to one of the known vault categories (DOCUMENT_TYPES).
 *  - Presence is decided solely by `documents.document_type` on the student's own rows.
 *  - Unknown / unmapped titles stay as "confirm yourself" scholarship_data gaps (never assumed present).
 */

import type { DocumentMeta, MissingInfo, RequirementData } from "./types";

/** Vault category values (aligned with `src/lib/documents/constants.ts` DOCUMENT_TYPES). */
export const VAULT_DOCUMENT_TYPES = [
  "passport",
  "transcript",
  "degree_certificate",
  "cv",
  "english_test",
  "recommendation_letter",
  "statement_of_purpose",
  "other",
] as const;

export type VaultDocumentType = (typeof VAULT_DOCUMENT_TYPES)[number];

/** Human labels used in gaps / digest (short, student-facing). */
const TYPE_LABEL: Record<VaultDocumentType, string> = {
  passport: "Passport / ID",
  transcript: "Transcript",
  degree_certificate: "Degree certificate",
  cv: "CV / Résumé",
  english_test: "English test result",
  recommendation_letter: "Recommendation letter",
  statement_of_purpose: "Statement of purpose",
  other: "Other document",
};

/**
 * Keywords that map a free-text requirement title to a vault category.
 * Order matters within a type: longer / more specific phrases first.
 * Matching is substring on a normalised title (lower-case, punctuation → space).
 */
const TYPE_KEYWORDS: { type: VaultDocumentType; keywords: string[] }[] = [
  { type: "passport", keywords: ["passport", "national id", "identity card", "cnic", "id card", "identity document"] },
  { type: "transcript", keywords: ["transcript", "mark sheet", "marksheet", "academic record", "grade report"] },
  { type: "degree_certificate", keywords: ["degree certificate", "degree diploma", "graduation certificate", "diploma certificate", "degree", "diploma"] },
  { type: "cv", keywords: ["curriculum vitae", "resume", "résumé", "cv"] },
  { type: "english_test", keywords: ["ielts", "toefl", "pte academic", "duolingo english", "english test", "english language test", "language test score"] },
  { type: "recommendation_letter", keywords: ["recommendation letter", "letter of recommendation", "reference letter", "referee letter", "lor"] },
  { type: "statement_of_purpose", keywords: ["statement of purpose", "personal statement", "motivation letter", "letter of motivation", "sop"] },
];

function normalizeText(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTypeKey(s: string): string {
  return normalizeText(s).replace(/\s+/g, "_");
}

/** Map a free-text title to a vault category, or null when no known category matches. */
export function mapTitleToVaultType(title: string): VaultDocumentType | null {
  const n = normalizeText(title);
  if (!n) return null;
  for (const { type, keywords } of TYPE_KEYWORDS) {
    for (const kw of keywords) {
      if (n === kw || n.includes(kw)) return type;
    }
  }
  // Exact match against the stored type key itself (e.g. title "degree_certificate").
  const key = normalizeTypeKey(title);
  if ((VAULT_DOCUMENT_TYPES as readonly string[]).includes(key) && key !== "other") {
    return key as VaultDocumentType;
  }
  return null;
}

/**
 * True when this requirement row is about a document the student might upload.
 * Convention: `requirement_type = 'document'` (case/space/hyphen insensitive), or the title maps
 * to a known vault category. Pakistan-side and pure eligibility rows are not document requirements.
 */
export function isDocumentRequirement(r: RequirementData): boolean {
  const t = normalizeTypeKey(r.type);
  if (t === "document" || t === "documents" || t === "required_document" || t === "required_documents") return true;
  return mapTitleToVaultType(r.title) !== null;
}

export type DocumentCoverageItem = {
  /** Vault category when mapped; null when the requirement is document-typed but unmapped. */
  vaultType: VaultDocumentType | null;
  /** Student-facing label (requirement title, or the vault label when mapped). */
  label: string;
  required: boolean;
  /** requirement id when known. */
  requirementId: string;
  status: "present" | "missing" | "unknown";
  /** Number of student documents whose document_type matches (0 when missing/unknown). */
  matchCount: number;
};

export type DocumentCoverage = {
  /** Documents the student has in the vault (metadata only). */
  ownedCount: number;
  items: DocumentCoverageItem[];
  present: DocumentCoverageItem[];
  missing: DocumentCoverageItem[];
  /** Document-typed requirements that could not be mapped to a vault category. */
  unknown: DocumentCoverageItem[];
};

/**
 * Compare scholarship document requirements against the student's vault metadata.
 * `documents === null` means the list could not be read → every item is "unknown".
 * `documents === []` means the vault is empty → every required mapped item is "missing".
 */
export function documentCoverage(
  requirements: readonly RequirementData[],
  documents: readonly DocumentMeta[] | null,
): DocumentCoverage {
  const ownedTypes = new Map<string, number>();
  if (documents) {
    for (const d of documents) {
      const key = d.documentType ? normalizeTypeKey(d.documentType) : "";
      if (!key) continue;
      ownedTypes.set(key, (ownedTypes.get(key) ?? 0) + 1);
    }
  }

  const items: DocumentCoverageItem[] = [];
  // One coverage row per distinct vault type (required wins over optional if both appear).
  const byType = new Map<VaultDocumentType, DocumentCoverageItem>();
  const unmapped: DocumentCoverageItem[] = [];

  for (const r of requirements) {
    if (!isDocumentRequirement(r)) continue;
    const vaultType = mapTitleToVaultType(r.title);
    if (!vaultType) {
      unmapped.push({
        vaultType: null,
        label: r.title.trim() || "Document",
        required: r.required,
        requirementId: r.id,
        status: documents === null ? "unknown" : "missing",
        matchCount: 0,
      });
      continue;
    }
    const matchCount = documents === null ? 0 : (ownedTypes.get(vaultType) ?? 0);
    const status: DocumentCoverageItem["status"] =
      documents === null ? "unknown" : matchCount > 0 ? "present" : "missing";
    const existing = byType.get(vaultType);
    if (existing) {
      // Prefer required; keep the first requirement id.
      if (r.required && !existing.required) {
        byType.set(vaultType, {
          ...existing,
          required: true,
          status,
          matchCount,
        });
      }
      continue;
    }
    byType.set(vaultType, {
      vaultType,
      label: TYPE_LABEL[vaultType],
      required: r.required,
      requirementId: r.id,
      status,
      matchCount,
    });
  }

  for (const item of byType.values()) items.push(item);
  items.push(...unmapped);

  // Stable order: missing required first, then present, then unknown; alpha within.
  const rank = (s: DocumentCoverageItem["status"]) => (s === "missing" ? 0 : s === "unknown" ? 1 : 2);
  items.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return a.label.localeCompare(b.label);
  });

  return {
    ownedCount: documents?.length ?? 0,
    items,
    present: items.filter((i) => i.status === "present"),
    missing: items.filter((i) => i.status === "missing"),
    unknown: items.filter((i) => i.status === "unknown" || i.vaultType === null),
  };
}

/**
 * Gaps that belong in `MissingInfo` from document coverage.
 * - Missing required (mapped) → where: "documents"
 * - Unmapped document requirements that are required → where: "scholarship_data" (confirm yourself)
 * - Empty vault with document requirements → also "No documents are in your vault yet" is handled by caller
 */
export function documentGaps(coverage: DocumentCoverage): MissingInfo[] {
  const out: MissingInfo[] = [];
  for (const item of coverage.items) {
    if (!item.required) continue;
    if (item.status === "missing" && item.vaultType) {
      out.push({ what: `Missing document: ${item.label}`, where: "documents" });
    } else if (item.vaultType === null && item.status !== "present") {
      // Unmapped document requirement — we cannot check the vault category.
      out.push({ what: `Confirm you can provide: ${item.label}`, where: "scholarship_data" });
    } else if (item.status === "unknown" && item.vaultType) {
      out.push({ what: `Could not verify document: ${item.label}`, where: "documents" });
    }
  }
  return out;
}

/** Compact digest line(s) for the model state block. Never invents presence. */
export function documentDigest(
  documents: readonly DocumentMeta[] | null,
  requirements: readonly RequirementData[],
): string {
  if (documents === null) return "documents: list unavailable";
  const cov = documentCoverage(requirements, documents);
  const lines: string[] = [`documents on file: ${documents.length}`];
  if (documents.length > 0) {
    const counts = new Map<string, number>();
    for (const d of documents) {
      const key = d.documentType ? normalizeTypeKey(d.documentType) : "untyped";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const summary = [...counts.entries()]
      .map(([k, n]) => `${k}${n > 1 ? `×${n}` : ""}`)
      .sort()
      .join(", ");
    lines.push(`document types: ${summary}`);
  }
  if (cov.items.length) {
    const parts = cov.items.map((i) => {
      const tag = i.status === "present" ? "present" : i.status === "missing" ? "missing" : "unverified";
      return `${i.label} → ${tag}${i.required ? "" : " (optional)"}`;
    });
    lines.push(`document requirements: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}
