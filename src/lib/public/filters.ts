import { isFundingType, isSlug } from "./format";
import type { ScholarshipFilters } from "./types";

export const PAGE_SIZE = 12;

export const DEADLINE_WINDOWS = [30, 90, 180] as const;
export const MAX_SEARCH_TOKENS = 5;
export const MAX_TOKEN_LENGTH = 40;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v : undefined;
}

function cleanText(value: string | undefined, max = 80): string | undefined {
  if (!value) return undefined;
  const v = value.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return v.length === 0 ? undefined : v.slice(0, max);
}

/**
 * Parses and validates public filter query params. Unknown / malformed values are dropped,
 * never passed through to the database.
 */
export function parseScholarshipFilters(params: RawParams): ScholarshipFilters {
  const country = cleanText(first(params.country));
  const funding = first(params.funding);
  const pageNum = Number.parseInt(first(params.page) ?? "1", 10);

  const university = cleanText(first(params.university));
  const windowDays = Number.parseInt(first(params.deadline) ?? "", 10);

  return {
    // `search` is accepted as an alias of `q` so shared links using either name work.
    q: cleanText(first(params.q)) ?? cleanText(first(params.search)),
    country: country && isSlug(country) ? country : undefined,
    university: university && isSlug(university) ? university : undefined,
    deadlineDays: (DEADLINE_WINDOWS as readonly number[]).includes(windowDays)
      ? (windowDays as 30 | 90 | 180)
      : undefined,
    degree: cleanText(first(params.degree)),
    field: cleanText(first(params.field)),
    funding: isFundingType(funding) ? funding : undefined,
    openOnly: first(params.open) === "1",
    sort: first(params.sort) === "name" ? "name" : "deadline",
    page: Number.isFinite(pageNum) ? Math.min(Math.max(pageNum, 1), 500) : 1,
  };
}

/** Builds a `/scholarships?...` URL preserving active filters (used for pagination links). */
export function scholarshipsHref(filters: ScholarshipFilters, overrides: Partial<ScholarshipFilters> = {}) {
  const f = { ...filters, ...overrides };
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.country) sp.set("country", f.country);
  if (f.degree) sp.set("degree", f.degree);
  if (f.field) sp.set("field", f.field);
  if (f.funding) sp.set("funding", f.funding);
  if (f.university) sp.set("university", f.university);
  if (f.deadlineDays) sp.set("deadline", String(f.deadlineDays));
  if (f.openOnly) sp.set("open", "1");
  if (f.sort !== "deadline") sp.set("sort", f.sort);
  if (f.page > 1) sp.set("page", String(f.page));
  const qs = sp.toString();
  return qs ? `/scholarships?${qs}` : "/scholarships";
}

/** Stable identity of the filter state in the URL (page excluded). Used to remount the uncontrolled filter form. */
export function filtersKey(f: ScholarshipFilters): string {
  return scholarshipsHref(f, { page: 1 });
}

export function hasActiveFilters(f: ScholarshipFilters): boolean {
  return Boolean(f.q || f.country || f.university || f.degree || f.field || f.funding || f.deadlineDays || f.openOnly);
}

// ---------------------------------------------------------------------------------------
// Keyword search helpers (pure; unit-tested). The query layer uses them to build PostgREST filters.
// ---------------------------------------------------------------------------------------

/** Removes characters that break PostgREST's `or=(...)` syntax and normalises whitespace. */
export function escapeSearch(value: string): string {
  return value.replace(/[,()*%\\":;]/g, " ").replace(/\s+/g, " ").trim();
}

/** Splits a search phrase into at most MAX_SEARCH_TOKENS lowercase tokens; every token must match somewhere. */
export function searchTokens(q: string | undefined): string[] {
  if (!q) return [];
  const clean = escapeSearch(q).toLowerCase();
  if (!clean) return [];
  return [...new Set(clean.split(" ").filter(Boolean).map((t) => t.slice(0, MAX_TOKEN_LENGTH)))].slice(0, MAX_SEARCH_TOKENS);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids of the named rows (universities / countries) whose name contains the token. */
export function idsMatchingToken(token: string, rows: ReadonlyArray<{ id: string; name: string }>, cap = 100): string[] {
  return rows
    .filter((r) => UUID.test(r.id) && r.name.toLowerCase().includes(token))
    .slice(0, cap)
    .map((r) => r.id);
}

/**
 * `or=(...)` clause for ONE token: matches the scholarship's own text columns, or its university / country
 * (resolved to ids beforehand). Searched columns: name, provider, field, degree_level, eligibility_summary,
 * university name, country name. Ids are validated UUIDs, so nothing user-typed reaches the id lists.
 */
export function tokenOrClause(token: string, universityIds: readonly string[], countryIds: readonly string[]): string {
  const t = escapeSearch(token);
  const parts = ["name", "provider", "field", "degree_level", "eligibility_summary"].map((c) => `${c}.ilike.%${t}%`);
  const uni = universityIds.filter((id) => UUID.test(id));
  const cty = countryIds.filter((id) => UUID.test(id));
  if (uni.length) parts.push(`university_id.in.(${uni.join(",")})`);
  if (cty.length) parts.push(`country_id.in.(${cty.join(",")})`);
  return parts.join(",");
}

/** Inclusive [from, to] ISO dates for "deadline within N days of today". */
export function deadlineRange(days: number, todayIso: string): { from: string; to: string } {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return { from: todayIso, to: d.toISOString().slice(0, 10) };
}
