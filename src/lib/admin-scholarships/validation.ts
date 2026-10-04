/**
 * Pure, server-side validation for the Module 07 admin scholarship forms.
 *
 * Rules mirror supabase/migrations/20261001000200_core_tables.sql (the source of truth):
 *  - scholarships: name/provider/country_id/degree_level/funding_type NOT NULL; numeric(4,2) GPA fields;
 *    numeric(10,2) fee; http(s) URL checks; dates ordered (deadline >= opening_date);
 *    status in draft|active|archived.
 * Only the explicit allow-list below is ever returned; unknown keys (role, id, status, created_at,
 * last_verified_at, ...) are ignored and never reach the database. Nothing here touches the network.
 */

export type Raw = FormData | Record<string, unknown>;
export type Errors = Record<string, string>;
export type Result<T> =
  | { ok: true; data: T; values: Record<string, string> }
  | { ok: false; errors: Errors; values: Record<string, string> };

export const FUNDING_TYPES = ["fully_funded", "partially_funded", "not_funded"] as const;
export type FundingType = (typeof FUNDING_TYPES)[number];

export const STATUSES = ["draft", "active", "archived"] as const;
export type ScholarshipStatus = (typeof STATUSES)[number];

/** Allowed explicit transitions. Publishing (-> active) is only ever reachable from draft. */
export const STATUS_TRANSITIONS: Record<ScholarshipStatus, readonly ScholarshipStatus[]> = {
  draft: ["active", "archived"],
  active: ["draft", "archived"],
  archived: ["draft"],
};

export const LIMITS = {
  name: 300,
  provider: 200,
  degreeLevel: 100,
  field: 200,
  longText: 4000,
  url: 2048,
  sourceName: 200,
  sourceType: 100,
  maxGpa: 99.99,
  maxFee: 99999999.99,
  minYear: 1950,
  maxYear: 2100,
  maxPriority: 1000,
} as const;

/** Suggested (not enforced) degree levels; the DB column is free text. */
export const DEGREE_LEVEL_SUGGESTIONS = ["Bachelor", "Master", "PhD", "Postdoctoral", "Diploma"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
export function isStatus(v: unknown): v is ScholarshipStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}
export function canTransition(from: ScholarshipStatus, to: ScholarshipStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

function get(raw: Raw, key: string): string {
  const v = raw instanceof FormData ? raw.get(key) : raw[key];
  return typeof v === "string" ? v : "";
}
function text(raw: Raw, key: string, values: Record<string, string>): string {
  const v = get(raw, key).replace(/\r\n/g, "\n").trim();
  values[key] = v;
  return v;
}

function checkText(
  v: string, key: string, label: string, max: number, errors: Errors,
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

function checkDate(v: string, key: string, label: string, errors: Errors): string | null {
  if (!v) return null;
  const m = DATE_RE.exec(v);
  if (!m) { errors[key] = `${label} must be a valid date.`; return null; }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    errors[key] = `${label} must be a valid date.`; return null;
  }
  if (y < LIMITS.minYear || y > LIMITS.maxYear) {
    errors[key] = `${label} must be between ${LIMITS.minYear} and ${LIMITS.maxYear}.`; return null;
  }
  return v;
}

/** Plain non-negative decimal with up to 2 decimals; rejects 1e3, NaN, Infinity, hex, signs. */
function checkDecimal(v: string, key: string, label: string, max: number, errors: Errors): number | null {
  if (!v) return null;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(v)) { errors[key] = `${label} must be a number with at most 2 decimal places.`; return null; }
  const n = Number(v);
  if (n > max) { errors[key] = `${label} must be at most ${max}.`; return null; }
  return n;
}

/** http(s) only (matches the DB CHECK constraints). Rejects javascript:, data:, ftp:, etc. */
function checkUrl(v: string, key: string, label: string, errors: Errors): string | null {
  if (!v) return null;
  if (v.length > LIMITS.url) { errors[key] = `${label} must be at most ${LIMITS.url} characters.`; return null; }
  if (/\s/.test(v) || CONTROL_RE.test(v)) { errors[key] = `${label} must be a valid http(s) URL.`; return null; }
  try {
    const u = new URL(v);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname || !/^https?:\/\//i.test(v)) {
      errors[key] = `${label} must start with http:// or https://.`;
      return null;
    }
    return v;
  } catch {
    errors[key] = `${label} must be a valid http(s) URL.`;
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
export type ScholarshipInput = {
  name: string;
  provider: string;
  country_id: string;
  university_id: string | null;
  degree_level: string;
  field: string | null;
  funding_type: FundingType;
  tuition_coverage: string | null;
  stipend_details: string | null;
  accommodation_details: string | null;
  travel_details: string | null;
  insurance_details: string | null;
  eligibility_summary: string | null;
  minimum_gpa: number | null;
  minimum_gpa_scale: number | null;
  english_requirement_summary: string | null;
  application_fee: number | null;
  opening_date: string | null;
  deadline: string | null;
  official_information_url: string | null;
  official_application_url: string | null;
};

/** The ONLY columns the admin form may write. `status`, `last_verified_at`, ids and timestamps are excluded. */
export const SCHOLARSHIP_WRITABLE_COLUMNS = [
  "name", "provider", "country_id", "university_id", "degree_level", "field", "funding_type",
  "tuition_coverage", "stipend_details", "accommodation_details", "travel_details", "insurance_details",
  "eligibility_summary", "minimum_gpa", "minimum_gpa_scale", "english_requirement_summary",
  "application_fee", "opening_date", "deadline", "official_information_url", "official_application_url",
] as const;

export function validateScholarship(raw: Raw): Result<ScholarshipInput> {
  const errors: Errors = {};
  const values: Record<string, string> = {};
  const t = (k: string) => text(raw, k, values);

  const name = checkText(t("name"), "name", "Name", LIMITS.name, errors, { required: true });
  const provider = checkText(t("provider"), "provider", "Provider", LIMITS.provider, errors, { required: true });

  const countryRaw = t("country_id");
  let country_id: string | null = null;
  if (!countryRaw) errors.country_id = "Country is required.";
  else if (!isUuid(countryRaw)) errors.country_id = "Choose a valid country.";
  else country_id = countryRaw;

  const uniRaw = t("university_id");
  let university_id: string | null = null;
  if (uniRaw) {
    if (!isUuid(uniRaw)) errors.university_id = "Choose a valid university.";
    else university_id = uniRaw;
  }

  const degree_level = checkText(t("degree_level"), "degree_level", "Degree level", LIMITS.degreeLevel, errors, { required: true });
  const field = checkText(t("field"), "field", "Field", LIMITS.field, errors);

  const fundingRaw = t("funding_type");
  let funding_type: FundingType | null = null;
  if (!fundingRaw) errors.funding_type = "Funding type is required.";
  else if (!(FUNDING_TYPES as readonly string[]).includes(fundingRaw)) errors.funding_type = "Choose a valid funding type.";
  else funding_type = fundingRaw as FundingType;

  const long = (k: string, label: string) => checkText(t(k), k, label, LIMITS.longText, errors, { multiline: true });
  const tuition_coverage = long("tuition_coverage", "Tuition coverage");
  const stipend_details = long("stipend_details", "Stipend details");
  const accommodation_details = long("accommodation_details", "Accommodation details");
  const travel_details = long("travel_details", "Travel details");
  const insurance_details = long("insurance_details", "Insurance details");
  const eligibility_summary = long("eligibility_summary", "Eligibility summary");
  const english_requirement_summary = long("english_requirement_summary", "English requirement summary");

  const minimum_gpa = checkDecimal(t("minimum_gpa"), "minimum_gpa", "Minimum GPA", LIMITS.maxGpa, errors);
  const minimum_gpa_scale = checkDecimal(t("minimum_gpa_scale"), "minimum_gpa_scale", "GPA scale", LIMITS.maxGpa, errors);
  if (minimum_gpa_scale !== null && minimum_gpa_scale <= 0 && !errors.minimum_gpa_scale) errors.minimum_gpa_scale = "GPA scale must be greater than 0.";
  if (minimum_gpa !== null && minimum_gpa_scale === null && !errors.minimum_gpa_scale && !errors.minimum_gpa) errors.minimum_gpa_scale = "Enter the GPA scale that the minimum GPA is measured on.";
  if (minimum_gpa !== null && minimum_gpa_scale !== null && minimum_gpa > minimum_gpa_scale && !errors.minimum_gpa) errors.minimum_gpa = "Minimum GPA cannot be higher than the GPA scale.";
  const application_fee = checkDecimal(t("application_fee"), "application_fee", "Application fee", LIMITS.maxFee, errors);

  const opening_date = checkDate(t("opening_date"), "opening_date", "Opening date", errors);
  const deadline = checkDate(t("deadline"), "deadline", "Deadline", errors);
  if (opening_date && deadline && deadline < opening_date) errors.deadline = "Deadline cannot be before the opening date.";

  const official_information_url = checkUrl(t("official_information_url"), "official_information_url", "Official information URL", errors);
  const official_application_url = checkUrl(t("official_application_url"), "official_application_url", "Official application URL", errors);

  if (Object.keys(errors).length || !name || !provider || !country_id || !degree_level || !funding_type) {
    return { ok: false, errors, values };
  }
  return {
    ok: true, values,
    data: {
      name, provider, country_id, university_id, degree_level, field, funding_type,
      tuition_coverage, stipend_details, accommodation_details, travel_details, insurance_details,
      eligibility_summary, minimum_gpa, minimum_gpa_scale, english_requirement_summary, application_fee,
      opening_date, deadline, official_information_url, official_application_url,
    },
  };
}

// ---------------------------------------------------------------------------------------------
export type SourceInput = {
  source_url: string;
  source_name: string | null;
  source_type: string | null;
  priority: number;
  active: boolean;
};

export function validateSource(raw: Raw): Result<SourceInput> {
  const errors: Errors = {};
  const values: Record<string, string> = {};
  const t = (k: string) => text(raw, k, values);

  const source_url = checkUrl(t("source_url"), "source_url", "Source URL", errors);
  if (!source_url && !errors.source_url) errors.source_url = "Source URL is required.";
  const source_name = checkText(t("source_name"), "source_name", "Source name", LIMITS.sourceName, errors);
  const source_type = checkText(t("source_type"), "source_type", "Source type", LIMITS.sourceType, errors);

  const pr = t("priority");
  let priority = 0;
  if (pr) {
    if (!/^\d{1,4}$/.test(pr) || Number(pr) > LIMITS.maxPriority) errors.priority = `Priority must be a whole number from 0 to ${LIMITS.maxPriority}.`;
    else priority = Number(pr);
  }
  const activeRaw = get(raw, "active");
  values.active = activeRaw;
  const active = activeRaw === "on" || activeRaw === "true" || activeRaw === "1";

  if (Object.keys(errors).length || !source_url) return { ok: false, errors, values };
  return { ok: true, values, data: { source_url, source_name, source_type, priority, active } };
}

// ---------------------------------------------------------------------------------------------
/** List filters for the admin table. Unknown / malformed values are dropped. */
export const ADMIN_PAGE_SIZE = 20;
export type AdminListFilters = { q?: string; status?: ScholarshipStatus; page: number };

export function parseAdminListFilters(params: Record<string, string | string[] | undefined>): AdminListFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const qRaw = first(params.q);
  const q = typeof qRaw === "string"
    ? qRaw.replace(/[\u0000-\u001f]/g, "").replace(/[,()*%\\":;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || undefined
    : undefined;
  const s = first(params.status);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    q,
    status: isStatus(s) ? s : undefined,
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), 1000) : 1,
  };
}
