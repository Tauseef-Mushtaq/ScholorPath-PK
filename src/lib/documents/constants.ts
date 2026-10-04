/**
 * Document Vault constants (Module 06). Pure and client-safe: no secrets, no server-only imports.
 * These MUST stay aligned with supabase/migrations/20261001000200 (documents CHECK constraints) and
 * 20261001000400 (bucket size limit + MIME allow-list). The database/Storage remain the final boundary.
 */

export const DOCUMENTS_BUCKET = "documents";

/** 10 MB, identical to the bucket `file_size_limit` and the `documents_size_limit` CHECK. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = "10 MB";

/** Lifetime of a view/download URL. Short on purpose; a new one is minted on every click. */
export const SIGNED_URL_TTL_SECONDS = 60;

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ALLOWED_FORMATS = [
  { mime: "application/pdf", label: "PDF", extensions: ["pdf"], storageExtension: "pdf" },
  { mime: "image/jpeg", label: "JPEG", extensions: ["jpg", "jpeg"], storageExtension: "jpg" },
  { mime: "image/png", label: "PNG", extensions: ["png"], storageExtension: "png" },
  { mime: DOCX_MIME, label: "DOCX", extensions: ["docx"], storageExtension: "docx" },
] as const;

export type AllowedMime = (typeof ALLOWED_FORMATS)[number]["mime"];

/** Value for <input accept>. A convenience only; the server re-validates everything. */
export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.docx";

export const SUPPORTED_FORMATS_LABEL = "PDF, JPEG, PNG or DOCX";

/** Longest display name stored in `documents.file_name` (the extension is preserved when truncating). */
export const DISPLAY_NAME_MAX = 150;

/**
 * `documents.document_type` is nullable free text in the schema (no CHECK). The app restricts it to
 * this short list, as ADR-027 does for education.level; see ADR-028. Optional on upload.
 */
export const DOCUMENT_TYPES = [
  { value: "passport", label: "Passport / ID" },
  { value: "transcript", label: "Transcript" },
  { value: "degree_certificate", label: "Degree certificate" },
  { value: "cv", label: "CV / Résumé" },
  { value: "english_test", label: "English test result" },
  { value: "recommendation_letter", label: "Recommendation letter" },
  { value: "statement_of_purpose", label: "Statement of purpose" },
  { value: "other", label: "Other" },
] as const;
