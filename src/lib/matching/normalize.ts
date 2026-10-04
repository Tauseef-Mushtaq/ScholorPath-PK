/**
 * Pure helpers that turn free-text scholarship data into something comparable.
 * Everything here is conservative: when text cannot be understood reliably the helpers say so
 * (empty set / null) instead of guessing, and callers treat that as "unknown", never "not eligible".
 */

// --------------------------------------------------------------------------------------------
// Education levels
// --------------------------------------------------------------------------------------------

export const LEVEL_RANK = { high_school: 1, intermediate: 2, bachelor: 3, master: 4, phd: 5 } as const;
export type LevelKey = keyof typeof LEVEL_RANK;

export const LEVEL_LABEL: Record<LevelKey, string> = {
  high_school: "Matric / O-Level",
  intermediate: "Intermediate / A-Level",
  bachelor: "Bachelor's",
  master: "Master's",
  phd: "PhD",
};

export function isLevelKey(value: unknown): value is LevelKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LEVEL_RANK, value);
}

export type ScholarshipLevels =
  | { kind: "any" } // "all levels" etc.: no level restriction
  | { kind: "levels"; levels: LevelKey[] } // recognised target level(s)
  | { kind: "unrecognized" }; // text we cannot map reliably

const PHD_RE = /\b(ph\.?\s?d|doctorate|doctoral|doctor of philosophy|dphil)\b/;
const MASTER_RE = /\b(masters?|master's|msc|m\.sc|ms|m\.s|ma|m\.a|mphil|m\.phil|mba|meng|m\.eng|mres|postgraduate|post-graduate)\b/;
const BACHELOR_RE = /\b(bachelors?|bachelor's|undergraduate|under-graduate|bsc|b\.sc|bs|b\.s|ba|b\.a|beng|b\.eng)\b/;
const ANY_RE = /\b(any|all)\s+(levels?|degrees?|programmes?|programs?)\b|^\s*(any|all|open)\s*$/;

/** Maps the free-text `scholarships.degree_level` to the canonical levels used by the student profile. */
export function parseScholarshipLevels(text: string | null | undefined): ScholarshipLevels {
  if (typeof text !== "string") return { kind: "unrecognized" };
  const t = text.toLowerCase().replace(/[’`]/g, "'");
  if (!t.trim()) return { kind: "unrecognized" };
  if (ANY_RE.test(t)) return { kind: "any" };
  const levels: LevelKey[] = [];
  if (BACHELOR_RE.test(t)) levels.push("bachelor");
  if (MASTER_RE.test(t)) levels.push("master");
  if (PHD_RE.test(t)) levels.push("phd");
  return levels.length ? { kind: "levels", levels } : { kind: "unrecognized" };
}

// --------------------------------------------------------------------------------------------
// Dates
// --------------------------------------------------------------------------------------------

/** `YYYY-MM-DD` (optionally followed by a time) -> the date part, or null if it is not a real date. */
export function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export type CompletionState = "completed" | "in_progress" | "undated";

/** Completed when the (expected or actual) graduation date is today or earlier. */
export function completionState(expectedGraduation: string | null, todayIso: string): CompletionState {
  const d = isoDateOrNull(expectedGraduation);
  if (!d) return "undated";
  return d <= todayIso ? "completed" : "in_progress";
}

// --------------------------------------------------------------------------------------------
// Field of study
// --------------------------------------------------------------------------------------------

const FIELD_STOPWORDS = new Set([
  "and", "or", "of", "in", "the", "for", "to", "with", "a", "an", "on", "studies", "study", "related", "other",
  "bachelor", "bachelors", "master", "masters", "phd", "bs", "bsc", "ms", "msc", "ma", "ba", "degree", "program", "programme",
]);

const ANY_FIELD_RE = /^(any|all|open|various|multiple|no specific|not specified|all fields?|any fields?|all subjects?|any subjects?|all disciplines?|any disciplines?|multidisciplinary|general)$/;

export function fieldTokens(text: string | null | undefined): string[] {
  if (typeof text !== "string") return [];
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || FIELD_STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return [...out];
}

/** True when the scholarship text means "no particular field" (or there is no text at all). */
export function isUnrestrictedField(text: string | null | undefined): boolean {
  if (typeof text !== "string") return true;
  const t = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return t === "" || ANY_FIELD_RE.test(t);
}

function tokensRelated(a: string, b: string): boolean {
  if (a === b) return true;
  // "engineering" ~ "engineer": one token starts with the other (min 5 chars to avoid noise like "art"/"artificial").
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short);
}

/**
 * Do the scholarship's field text and ANY of the student's field texts share a meaningful word?
 * Free text cannot be compared perfectly (e.g. "Software Engineering" vs "Computer Science" share nothing),
 * so a `false` here means "no overlap found", and callers only use it to decide RELEVANCE, never eligibility.
 */
export function fieldsOverlap(scholarshipField: string, studentFields: readonly string[]): boolean {
  const sTokens = fieldTokens(scholarshipField);
  if (sTokens.length === 0) return true; // nothing meaningful to compare => do not exclude
  for (const f of studentFields) {
    const tokens = fieldTokens(f);
    for (const a of sTokens) for (const b of tokens) if (tokensRelated(a, b)) return true;
  }
  return false;
}

// --------------------------------------------------------------------------------------------
// GPA
// --------------------------------------------------------------------------------------------

/** A usable CGPA ratio in [0,1], or null if the numbers are missing/invalid (scale <= 0, cgpa > scale, NaN...). */
export function gpaRatio(value: number | null | undefined, scale: number | null | undefined): number | null {
  if (typeof value !== "number" || typeof scale !== "number") return null;
  if (!Number.isFinite(value) || !Number.isFinite(scale)) return null;
  if (scale <= 0 || value < 0 || value > scale) return null;
  return value / scale;
}

export function formatRatioPercent(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}
