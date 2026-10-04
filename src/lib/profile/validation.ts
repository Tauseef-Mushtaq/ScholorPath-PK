import { EDUCATION_LEVELS, EXPERIENCE_TYPES } from "./types";

/**
 * Pure, server-side validation for the student profile forms. These functions never touch the
 * database and never read an owner/user id: ownership is derived from the session on the server.
 */

type Raw = FormData | Record<string, unknown>;
export type Errors = Record<string, string>;
export type Result<T> = { ok: true; data: T; values: Record<string, string> } | { ok: false; errors: Errors; values: Record<string, string> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const LIMITS = {
  fullName: 200,
  nationality: 100,
  city: 100,
  degreeName: 200,
  field: 200,
  institution: 200,
  title: 150,
  organization: 200,
  description: 2000,
  maxGpaValue: 99.99, // numeric(4,2)
  minYear: 1950,
  maxYear: 2100,
} as const;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function get(raw: Raw, key: string): string {
  const v = raw instanceof FormData ? raw.get(key) : raw[key];
  return typeof v === "string" ? v : "";
}

function text(raw: Raw, key: string, values: Record<string, string>): string {
  // Collapse nothing inside multi-line text; just trim ends and normalise newlines.
  const v = get(raw, key).replace(/\r\n/g, "\n").trim();
  values[key] = v;
  return v;
}

function checkText(
  v: string,
  key: string,
  label: string,
  max: number,
  errors: Errors,
  { required = false, multiline = false } = {},
): string | null {
  if (!v) {
    if (required) errors[key] = `${label} is required.`;
    return null;
  }
  if (v.length > max) errors[key] = `${label} must be at most ${max} characters.`;
  else if (CONTROL_RE.test(v) || (!multiline && /[\n\r\t]/.test(v))) errors[key] = `${label} contains invalid characters.`;
  return v;
}

/** Returns a normalised YYYY-MM-DD or null (empty). Sets an error for malformed / impossible dates. */
function checkDate(v: string, key: string, label: string, errors: Errors): string | null {
  if (!v) return null;
  const m = DATE_RE.exec(v);
  if (!m) {
    errors[key] = `${label} must be a valid date.`;
    return null;
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const real = dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  if (!real) {
    errors[key] = `${label} must be a valid date.`;
    return null;
  }
  if (y < LIMITS.minYear || y > LIMITS.maxYear) {
    errors[key] = `${label} must be between ${LIMITS.minYear} and ${LIMITS.maxYear}.`;
    return null;
  }
  return v;
}

/** Parses a plain decimal ("3.5", "85"); rejects "1e3", "NaN", "Infinity", hex, etc. */
function checkDecimal(v: string, key: string, label: string, errors: Errors): number | null {
  if (!v) return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) {
    errors[key] = `${label} must be a number with at most 2 decimal places.`;
    return null;
  }
  const n = Number(v);
  if (n > LIMITS.maxGpaValue) {
    errors[key] = `${label} must be at most ${LIMITS.maxGpaValue}.`;
    return null;
  }
  return n;
}

function checkEnum(v: string, key: string, label: string, allowed: readonly string[], errors: Errors, required = true) {
  if (!v) {
    if (required) errors[key] = `${label} is required.`;
    return null;
  }
  if (!allowed.includes(v)) {
    errors[key] = `Choose a valid ${label.toLowerCase()}.`;
    return null;
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
export type ProfileInput = { full_name: string; nationality: string | null; city: string | null };

export function validateProfile(raw: Raw): Result<ProfileInput> {
  const errors: Errors = {};
  const values: Record<string, string> = {};
  const full_name = checkText(text(raw, "full_name", values), "full_name", "Full name", LIMITS.fullName, errors, { required: true });
  const nationality = checkText(text(raw, "nationality", values), "nationality", "Nationality", LIMITS.nationality, errors);
  const city = checkText(text(raw, "city", values), "city", "City", LIMITS.city, errors);
  if (Object.keys(errors).length || !full_name) return { ok: false, errors, values };
  return { ok: true, data: { full_name, nationality, city }, values };
}

// ---------------------------------------------------------------------------------------------
export type EducationInput = {
  level: string;
  degree_name: string | null;
  field: string | null;
  institution: string;
  cgpa: number | null;
  cgpa_scale: number | null;
  start_date: string | null;
  expected_graduation: string | null;
};

export function validateEducation(raw: Raw): Result<EducationInput> {
  const errors: Errors = {};
  const values: Record<string, string> = {};
  const levelRaw = text(raw, "level", values);
  const level = checkEnum(levelRaw, "level", "Level", EDUCATION_LEVELS.map((l) => l.value), errors);
  const institution = checkText(text(raw, "institution", values), "institution", "Institution", LIMITS.institution, errors, { required: true });
  const degree_name = checkText(text(raw, "degree_name", values), "degree_name", "Degree name", LIMITS.degreeName, errors);
  const field = checkText(text(raw, "field", values), "field", "Field of study", LIMITS.field, errors);
  const cgpa = checkDecimal(text(raw, "cgpa", values), "cgpa", "CGPA", errors);
  const cgpa_scale = checkDecimal(text(raw, "cgpa_scale", values), "cgpa_scale", "CGPA scale", errors);
  const start_date = checkDate(text(raw, "start_date", values), "start_date", "Start date", errors);
  const expected_graduation = checkDate(text(raw, "expected_graduation", values), "expected_graduation", "Graduation date", errors);

  if (values.cgpa_scale === "100" || values.cgpa_scale === "100.00") {
    // education.cgpa/cgpa_scale are numeric(4,2) (max 99.99), so a 100-point scale cannot be stored.
    errors.cgpa_scale = "Scales of 100 (percentages) are not supported yet. Enter your CGPA on its own scale, for example 4.00.";
  }
  if (!errors.cgpa_scale && cgpa_scale !== null && cgpa_scale <= 0) errors.cgpa_scale = "CGPA scale must be greater than 0.";
  if (!errors.cgpa && !errors.cgpa_scale) {
    if (cgpa !== null && cgpa_scale === null) errors.cgpa_scale = "Enter the scale your CGPA is out of (for example 4.00).";
    else if (cgpa !== null && cgpa_scale !== null && cgpa > cgpa_scale) errors.cgpa = "CGPA cannot be higher than the scale.";
  }
  if (start_date && expected_graduation && expected_graduation < start_date) {
    errors.expected_graduation = "Graduation date cannot be before the start date.";
  }

  if (Object.keys(errors).length || !level || !institution) return { ok: false, errors, values };
  return { ok: true, data: { level, degree_name, field, institution, cgpa, cgpa_scale, start_date, expected_graduation }, values };
}

// ---------------------------------------------------------------------------------------------
export type ExperienceInput = {
  experience_type: string;
  title: string;
  organization: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
};

export function validateExperience(raw: Raw): Result<ExperienceInput> {
  const errors: Errors = {};
  const values: Record<string, string> = {};
  const typeRaw = text(raw, "experience_type", values);
  const experience_type = checkEnum(typeRaw, "experience_type", "Type", EXPERIENCE_TYPES.map((t) => t.value), errors);
  const title = checkText(text(raw, "title", values), "title", "Title", LIMITS.title, errors, { required: true });
  const organization = checkText(text(raw, "organization", values), "organization", "Organization", LIMITS.organization, errors);
  const description = checkText(text(raw, "description", values), "description", "Description", LIMITS.description, errors, { multiline: true });
  const start_date = checkDate(text(raw, "start_date", values), "start_date", "Start date", errors);
  const end_date = checkDate(text(raw, "end_date", values), "end_date", "End date", errors);
  if (start_date && end_date && end_date < start_date) errors.end_date = "End date cannot be before the start date.";

  if (Object.keys(errors).length || !experience_type || !title) return { ok: false, errors, values };
  return { ok: true, data: { experience_type, title, organization, description, start_date, end_date }, values };
}
