import { SCHOLARSHIP_WRITABLE_COLUMNS, validateSource, type SourceInput } from "./validation";

/**
 * Pure parsing for the curated-dataset JSON import. Records reference a country (and optionally a
 * university) by SLUG, which the server resolves to ids; everything else is validated by
 * validateScholarship(). Imported records are ALWAYS created as `draft` (never published by import).
 */
export const IMPORT_MAX_RECORDS = 50;
export const IMPORT_MAX_BYTES = 200_000;

export const IMPORT_MAX_SOURCES = 5;
export type ImportRecord = { index: number; countrySlug: string; universitySlug: string; fields: Record<string, string>; sources: SourceInput[] };
export type ImportParse = { ok: true; records: ImportRecord[] } | { ok: false; error: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED = new Set<string>([...SCHOLARSHIP_WRITABLE_COLUMNS.filter((c) => c !== "country_id" && c !== "university_id"), "country_slug", "university_slug", "sources"]);

export function parseImportJson(input: string): ImportParse {
  if (typeof input !== "string" || !input.trim()) return { ok: false, error: "Paste a JSON array of scholarship records." };
  if (input.length > IMPORT_MAX_BYTES) return { ok: false, error: "The import is too large. Split it into smaller batches." };
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { return { ok: false, error: "That is not valid JSON." }; }
  if (!Array.isArray(parsed) || parsed.length === 0) return { ok: false, error: "The import must be a non-empty JSON array." };
  if (parsed.length > IMPORT_MAX_RECORDS) return { ok: false, error: `Import at most ${IMPORT_MAX_RECORDS} records at a time.` };

  const records: ImportRecord[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, error: `Record ${i + 1} must be an object.` };
    const obj = item as Record<string, unknown>;
    const unknown = Object.keys(obj).filter((k) => !ALLOWED.has(k));
    if (unknown.length) return { ok: false, error: `Record ${i + 1} has unsupported field(s): ${unknown.slice(0, 5).join(", ")}.` };
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "country_slug" || k === "university_slug" || k === "sources") continue;
      if (v === null || v === undefined) continue;
      if (typeof v === "string") fields[k] = v;
      else if (typeof v === "number" && Number.isFinite(v)) fields[k] = String(v);
      else return { ok: false, error: `Record ${i + 1}: "${k}" must be a string or number.` };
    }
    const cs = typeof obj.country_slug === "string" ? obj.country_slug.trim() : "";
    const us = typeof obj.university_slug === "string" ? obj.university_slug.trim() : "";
    if (!cs || !SLUG_RE.test(cs)) return { ok: false, error: `Record ${i + 1}: country_slug is required (lowercase letters, digits, hyphens).` };
    if (us && !SLUG_RE.test(us)) return { ok: false, error: `Record ${i + 1}: university_slug is not a valid slug.` };
    const sources: SourceInput[] = [];
    if (obj.sources !== undefined && obj.sources !== null) {
      if (!Array.isArray(obj.sources) || obj.sources.length > IMPORT_MAX_SOURCES) return { ok: false, error: `Record ${i + 1}: sources must be an array of at most ${IMPORT_MAX_SOURCES} items.` };
      for (const src of obj.sources) {
        if (!src || typeof src !== "object" || Array.isArray(src)) return { ok: false, error: `Record ${i + 1}: each source must be an object.` };
        const bad = Object.keys(src).filter((k) => !["source_url", "source_name", "source_type"].includes(k));
        if (bad.length) return { ok: false, error: `Record ${i + 1}: unsupported source field(s): ${bad.slice(0, 5).join(", ")}.` };
        const r = validateSource({ ...(src as Record<string, unknown>), active: "on" });
        if (!r.ok) return { ok: false, error: `Record ${i + 1}: invalid source - ${Object.values(r.errors)[0]}` };
        sources.push(r.data);
      }
    }
    records.push({ index: i + 1, countrySlug: cs, universitySlug: us, fields, sources });
  }
  return { ok: true, records };
}
