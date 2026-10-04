/**
 * Pure upload validation helpers (Module 06). No I/O, no framework imports, no secrets, so they are
 * unit-testable and safe to import from client code (the client uses `precheckFile` for fast feedback
 * only; the server action always re-validates from the actual bytes).
 */
import {
  ALLOWED_FORMATS,
  DISPLAY_NAME_MAX,
  DOCUMENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_LABEL,
  SUPPORTED_FORMATS_LABEL,
  type AllowedMime,
} from "./constants";

export const MESSAGES = {
  noFile: "Please choose a file to upload.",
  empty: "This file is empty.",
  tooLarge: `This file is larger than ${MAX_FILE_SIZE_LABEL}.`,
  unsupported: "This file type isn't supported.",
  mismatch: `This file doesn't look like a real ${SUPPORTED_FORMATS_LABEL} file. Please choose a different file.`,
  badType: "Please choose a valid document type.",
} as const;

export type UploadErrorCode = "no_file" | "empty" | "too_large" | "unsupported_type" | "type_mismatch";

export type UploadCheck =
  | { ok: true; mime: AllowedMime; displayName: string }
  | { ok: false; code: UploadErrorCode; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

// --------------------------------------------------------------------------- names

/** Lower-cased extension of the last path segment, or "" when there is none / it is not plain alphanumeric. */
export function fileExtension(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/[\s.]+$/, "");
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return ""; // no dot, or a dotfile such as ".pdf" with no name
  const ext = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "";
}

/**
 * Safe DISPLAY name for `documents.file_name`. It is never used as (part of) a storage path.
 * Strips any directory part (so "../../x.pdf" and "/other-user/x.pdf" become "x.pdf"), control and
 * bidi-override characters, shell/URL-hostile characters, collapses whitespace, removes leading dots
 * and truncates by code point while keeping the extension. Unicode letters are preserved.
 */
export function sanitizeDisplayName(raw: unknown): string {
  let s = typeof raw === "string" ? raw : "";
  s = s.normalize("NFC");
  s = s.split(/[\\/]/).pop() ?? "";
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, "");
  s = s.replace(/[<>:"|?*]/g, "_");
  s = s.replace(/\s+/g, " ").trim().replace(/^\.+/, "").trim();
  if (!s) return "document";

  const chars = Array.from(s);
  if (chars.length <= DISPLAY_NAME_MAX) return s;
  const ext = /\.[A-Za-z0-9]{1,10}$/.exec(s)?.[0] ?? "";
  const keep = Math.max(1, DISPLAY_NAME_MAX - Array.from(ext).length);
  return Array.from(s.slice(0, s.length - ext.length)).slice(0, keep).join("") + ext;
}

// --------------------------------------------------------------------------- type detection

function startsWith(bytes: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[offset + i] !== sig[i]) return false;
  return true;
}

function asciiBytes(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

/** True if the ASCII needle occurs in bytes[start, end). */
function includesAscii(bytes: Uint8Array, needle: string, start = 0, end = bytes.length): boolean {
  const n = asciiBytes(needle);
  const last = Math.min(end, bytes.length) - n.length;
  for (let i = start; i <= last; i++) {
    if (bytes[i] !== n[0]) continue;
    let j = 1;
    while (j < n.length && bytes[i + j] === n[j]) j++;
    if (j === n.length) return true;
  }
  return false;
}

/**
 * Signature ("magic byte") check. Returns the format the BYTES actually look like, or null.
 * PDF: "%PDF-" within the first 1024 bytes (as readers accept). JPEG: FF D8 FF. PNG: 8-byte signature.
 * DOCX: a ZIP ("PK\x03\x04") that contains "[Content_Types].xml" and "word/document.xml".
 * This is a sanity check, not an antivirus: it stops e.g. an HTML/EXE file renamed to .pdf.
 */
export function detectFormat(bytes: Uint8Array): AllowedMime | null {
  if (includesAscii(bytes, "%PDF-", 0, 1024)) return "application/pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && includesAscii(bytes, "[Content_Types].xml") && includesAscii(bytes, "word/document.xml")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

function formatForExtension(ext: string) {
  return ALLOWED_FORMATS.find((f) => (f.extensions as readonly string[]).includes(ext));
}

function normalizeClientType(t: unknown): string {
  return typeof t === "string" ? (t.split(";")[0] ?? "").trim().toLowerCase() : "";
}

// --------------------------------------------------------------------------- validation

/** Cheap client-side hint using only name + size. NOT a security control. */
export function precheckFile(file: { name: string; size: number }): string | null {
  if (file.size <= 0) return MESSAGES.empty;
  if (file.size > MAX_FILE_SIZE_BYTES) return MESSAGES.tooLarge;
  if (!formatForExtension(fileExtension(file.name))) return MESSAGES.unsupported;
  return null;
}

/**
 * Full server-side validation of an upload. `size` and `bytes` come from the server's own parse of the
 * request; `name` and `clientType` are untrusted and used only for consistency checks. The stored MIME
 * type is always derived here (extension + signature), never copied from the browser.
 */
export function validateUpload(input: { name: unknown; clientType: unknown; bytes: Uint8Array }): UploadCheck {
  const { bytes } = input;
  const fail = (code: UploadErrorCode, message: string): UploadCheck => ({ ok: false, code, message });

  if (bytes.byteLength === 0) return fail("empty", MESSAGES.empty);
  if (bytes.byteLength > MAX_FILE_SIZE_BYTES) return fail("too_large", MESSAGES.tooLarge);

  const name = typeof input.name === "string" ? input.name : "";
  const format = formatForExtension(fileExtension(name));
  if (!format) return fail("unsupported_type", MESSAGES.unsupported);

  const clientType = normalizeClientType(input.clientType);
  if (clientType !== "") {
    if (!ALLOWED_FORMATS.some((f) => f.mime === clientType)) return fail("unsupported_type", MESSAGES.unsupported);
    if (clientType !== format.mime) return fail("type_mismatch", MESSAGES.mismatch);
  }

  if (detectFormat(bytes) !== format.mime) return fail("type_mismatch", MESSAGES.mismatch);

  return { ok: true, mime: format.mime, displayName: sanitizeDisplayName(name) };
}

/** `undefined`/"" -> null (not specified); an allow-listed value -> itself; anything else -> undefined (invalid). */
export function parseDocumentType(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  return DOCUMENT_TYPES.some((t) => t.value === v) ? v : undefined;
}

// --------------------------------------------------------------------------- storage paths

/**
 * Server-generated object path: `<authenticated user id>/<random uuid>.<extension from the verified type>`.
 * Nothing from the browser (file name, path, ids) is part of it.
 */
export function buildStoragePath(userId: string, mime: AllowedMime): string {
  if (!isUuid(userId)) throw new Error("buildStoragePath: invalid user id");
  const format = ALLOWED_FORMATS.find((f) => f.mime === mime);
  if (!format) throw new Error("buildStoragePath: unsupported mime");
  return `${userId.toLowerCase()}/${crypto.randomUUID()}.${format.storageExtension}`;
}

/** Defence in depth before touching Storage with a path read from the DB: exactly `<userId>/<one safe segment>`. */
export function isStoragePathForUser(path: unknown, userId: string): boolean {
  if (typeof path !== "string" || !isUuid(userId)) return false;
  const prefix = `${userId.toLowerCase()}/`;
  if (!path.startsWith(prefix)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(path.slice(prefix.length)) && !path.includes("..");
}

// --------------------------------------------------------------------------- display

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function documentTypeLabel(v: string | null): string {
  return DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? "Not specified";
}

export function formatFormatLabel(mime: string): string {
  return ALLOWED_FORMATS.find((f) => f.mime === mime)?.label ?? "File";
}
