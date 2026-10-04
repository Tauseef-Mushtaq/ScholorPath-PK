import "server-only";

import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";

import { isFundingType, isSlug, isUuid, todayIsoDate } from "./format";
import { deadlineRange, idsMatchingToken, PAGE_SIZE, searchTokens, tokenOrClause } from "./filters";
import type {
  CountryDetail,
  CountrySummary,
  FilterOptions,
  FundingType,
  ScholarshipDetail,
  ScholarshipFilters,
  ScholarshipListItem,
} from "./types";

/**
 * Public read layer. Every query:
 *  - uses the cookie-less anon client (RLS applies; active scholarships / verified mentors only),
 *  - selects EXPLICIT columns (never `*`; e.g. scholarship_sources.content_hash is not selected),
 *  - throws a PublicDataError instead of leaking raw database errors to the UI.
 */

export class PublicDataError extends Error {
  constructor(
    public readonly kind: "unconfigured" | "query",
    message: string,
  ) {
    super(message);
    this.name = "PublicDataError";
  }
}

function db() {
  const client = createPublicClient();
  if (!client) throw new PublicDataError("unconfigured", "Supabase is not configured.");
  return client;
}

function fail(scope: string, error: { message?: string; code?: string }): never {
  // Logged server-side only. The UI shows a generic message.
  console.error(`[public-data] ${scope} failed`, error.code ?? "", error.message ?? "");
  throw new PublicDataError("query", `${scope} failed`);
}

/** Runs a loader; returns null when Supabase isn't configured. Other failures still throw. */
export async function loadOrUnavailable<T>(loader: () => Promise<T>): Promise<T | null> {
  try {
    return await loader();
  } catch (e) {
    if (e instanceof PublicDataError && e.kind === "unconfigured") return null;
    throw e;
  }
}

/** For decorative sections (landing page): any failure becomes null so the page still renders. */
export async function loadSoft<T>(loader: () => Promise<T>): Promise<T | null> {
  try {
    return await loader();
  } catch (e) {
    if (!(e instanceof PublicDataError)) console.error("[public-data] unexpected", e);
    return null;
  }
}

// PostgREST returns embedded to-one relations as an object, but typings may say array.
function one<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

type Row = Record<string, unknown>;

function toListItem(row: Row): ScholarshipListItem {
  const country = one<Row>(row.countries);
  const university = one<Row>(row.universities);
  return {
    id: String(row.id),
    name: String(row.name),
    provider: String(row.provider),
    degreeLevel: String(row.degree_level),
    field: str(row.field),
    fundingType: isFundingType(row.funding_type) ? row.funding_type : "not_funded",
    deadline: str(row.deadline),
    country: country ? { name: String(country.name), slug: String(country.slug) } : null,
    university: university ? { name: String(university.name) } : null,
  };
}

const LIST_COLUMNS =
  "id,name,provider,degree_level,field,funding_type,deadline,countries!inner(name,slug),universities(name)";

// ---------------------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------------------

export async function getCountries(limit?: number): Promise<CountrySummary[]> {
  let query = db()
    .from("countries")
    .select("id,name,slug,region,scholarships(count)")
    .order("name", { ascending: true });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) fail("countries", error);
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    region: str(row.region),
    // Embedded count is evaluated under RLS, so it only counts ACTIVE scholarships for anon.
    scholarshipCount: num(one<Row>(row.scholarships)?.count) ?? 0,
  }));
}

export const getCountryBySlug = cache(async (slug: string): Promise<CountryDetail | null> => {
  if (!isSlug(slug)) return null;
  const supabase = db();
  const { data, error } = await supabase
    .from("countries")
    .select("id,name,slug,region")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("country", error);
  if (!data) return null;
  const country = data as unknown as Row;

  const { data: unis, error: uniError } = await supabase
    .from("universities")
    .select("id,name,slug,website")
    .eq("country_id", String(country.id))
    .order("name", { ascending: true })
    .limit(100);
  if (uniError) fail("country universities", uniError);

  return {
    id: String(country.id),
    name: String(country.name),
    slug: String(country.slug),
    region: str(country.region),
    universities: ((unis ?? []) as unknown as Row[]).map((u) => ({
      id: String(u.id),
      name: String(u.name),
      slug: String(u.slug),
      website: str(u.website),
    })),
  };
});

export async function getCountryScholarships(countryId: string, limit = 50): Promise<ScholarshipListItem[]> {
  const { data, error } = await db()
    .from("scholarships")
    .select(LIST_COLUMNS)
    .eq("country_id", countryId)
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(limit);
  if (error) fail("country scholarships", error);
  return ((data ?? []) as unknown as Row[]).map(toListItem);
}

// ---------------------------------------------------------------------------------------
// Scholarships
// ---------------------------------------------------------------------------------------

export async function getScholarships(
  filters: ScholarshipFilters,
): Promise<{ items: ScholarshipListItem[]; total: number }> {
  const supabase = db();

  // University filter: resolve the slug once (RLS: universities are public reference data).
  let universityId: string | null = null;
  if (filters.university) {
    const { data, error } = await supabase.from("universities").select("id").eq("slug", filters.university).maybeSingle();
    if (error) fail("university filter", error);
    if (!data) return { items: [], total: 0 }; // unknown slug -> no matches (never "all")
    universityId = String((data as unknown as Row).id);
  }

  // Keyword search: every token must match one of the searched columns OR a university / country name.
  // Two small lookups regardless of token count (no per-row queries, no whole-table fetch).
  const tokens = searchTokens(filters.q);
  let uniRows: { id: string; name: string }[] = [];
  let countryRows: { id: string; name: string }[] = [];
  if (tokens.length) {
    const nameFilter = tokens.map((t) => `name.ilike.%${t}%`).join(",");
    const [u, c] = await Promise.all([
      supabase.from("universities").select("id,name").or(nameFilter).limit(200),
      supabase.from("countries").select("id,name").or(nameFilter).limit(200),
    ]);
    if (u.error) fail("search universities", u.error);
    if (c.error) fail("search countries", c.error);
    uniRows = ((u.data ?? []) as unknown as Row[]).map((r) => ({ id: String(r.id), name: String(r.name) }));
    countryRows = ((c.data ?? []) as unknown as Row[]).map((r) => ({ id: String(r.id), name: String(r.name) }));
  }

  // RLS (scholarships_select_active) is what restricts anon to status = 'active'; nothing here widens it.
  let query = supabase.from("scholarships").select(LIST_COLUMNS, { count: "exact" });

  if (filters.country) query = query.eq("countries.slug", filters.country);
  if (universityId) query = query.eq("university_id", universityId);
  if (filters.degree) query = query.eq("degree_level", filters.degree);
  if (filters.field) query = query.eq("field", filters.field);
  if (filters.funding) query = query.eq("funding_type", filters.funding as FundingType);
  if (filters.deadlineDays) {
    const { from, to } = deadlineRange(filters.deadlineDays, todayIsoDate());
    query = query.gte("deadline", from).lte("deadline", to);
  } else if (filters.openOnly) {
    query = query.or(`deadline.is.null,deadline.gte.${todayIsoDate()}`);
  }
  for (const token of tokens) {
    query = query.or(tokenOrClause(token, idsMatchingToken(token, uniRows), idsMatchingToken(token, countryRows)));
  }

  query =
    filters.sort === "name"
      ? query.order("name", { ascending: true }).order("id", { ascending: true })
      : query
          .order("deadline", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true })
          .order("id", { ascending: true });

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) fail("scholarships", error);
  return { items: ((data ?? []) as unknown as Row[]).map(toListItem), total: count ?? 0 };
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const supabase = db();
  const [countries, facets] = await Promise.all([
    supabase.from("countries").select("name,slug").order("name", { ascending: true }),
    supabase.from("scholarships").select("degree_level,field,universities(name,slug)").limit(1000),
  ]);
  if (countries.error) fail("filter countries", countries.error);
  if (facets.error) fail("filter facets", facets.error);

  const degrees = new Set<string>();
  const fields = new Set<string>();
  const universities = new Map<string, string>();
  for (const row of (facets.data ?? []) as unknown as Row[]) {
    const u = one<Row>(row.universities);
    if (u && str(u.slug) && str(u.name)) universities.set(String(u.slug), String(u.name));
    const d = str(row.degree_level);
    const f = str(row.field);
    if (d) degrees.add(d);
    if (f) fields.add(f);
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return {
    countries: ((countries.data ?? []) as unknown as Row[]).map((c) => ({ name: String(c.name), slug: String(c.slug) })),
    // Only universities that actually have a public scholarship are offered (no dead-end options).
    universities: [...universities].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
    degrees: sort(degrees),
    fields: sort(fields),
  };
}

const DETAIL_COLUMNS = [
  "id,name,provider,degree_level,field,funding_type,deadline",
  "tuition_coverage,stipend_details,accommodation_details,travel_details,insurance_details",
  "eligibility_summary,minimum_gpa,minimum_gpa_scale,english_requirement_summary",
  "application_fee,opening_date,official_information_url,official_application_url,last_verified_at",
  "countries!inner(name,slug),universities(name,website)",
].join(",");

export const getScholarshipById = cache(async (id: string): Promise<ScholarshipDetail | null> => {
  if (!isUuid(id)) return null;
  const supabase = db();

  const { data, error } = await supabase
    .from("scholarships")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("scholarship", error);
  if (!data) return null; // missing OR not active (RLS hides drafts/archived)

  const [reqs, sources] = await Promise.all([
    supabase
      .from("scholarship_requirements")
      .select("id,requirement_type,title,description,required,source_id")
      .eq("scholarship_id", id)
      .order("required", { ascending: false })
      .order("title", { ascending: true }),
    supabase
      .from("scholarship_sources")
      .select("id,source_url,source_name,source_type,priority,last_verified_at")
      .eq("scholarship_id", id)
      // Assumption: a LOWER number means a higher-trust source (1 = official provider).
      .order("priority", { ascending: true }),
  ]);
  if (reqs.error) fail("scholarship requirements", reqs.error);
  if (sources.error) fail("scholarship sources", sources.error);

  const row = data as unknown as Row;
  const base = toListItem(row);
  const uni = one<Row>(row.universities);

  return {
    ...base,
    university: uni ? { name: String(uni.name), website: str(uni.website) } : null,
    tuitionCoverage: str(row.tuition_coverage),
    stipendDetails: str(row.stipend_details),
    accommodationDetails: str(row.accommodation_details),
    travelDetails: str(row.travel_details),
    insuranceDetails: str(row.insurance_details),
    eligibilitySummary: str(row.eligibility_summary),
    minimumGpa: num(row.minimum_gpa),
    minimumGpaScale: num(row.minimum_gpa_scale),
    englishRequirementSummary: str(row.english_requirement_summary),
    applicationFee: num(row.application_fee),
    openingDate: str(row.opening_date),
    officialInformationUrl: str(row.official_information_url),
    officialApplicationUrl: str(row.official_application_url),
    lastVerifiedAt: str(row.last_verified_at),
    requirements: ((reqs.data ?? []) as unknown as Row[]).map((r) => ({
      id: String(r.id),
      requirementType: String(r.requirement_type),
      title: String(r.title),
      description: str(r.description),
      required: r.required !== false,
      sourceId: str(r.source_id),
    })),
    sources: ((sources.data ?? []) as unknown as Row[]).map((s) => ({
      id: String(s.id),
      sourceUrl: String(s.source_url),
      sourceName: str(s.source_name),
      sourceType: str(s.source_type),
      priority: num(s.priority) ?? 0,
      lastVerifiedAt: str(s.last_verified_at),
    })),
  };
});

// ---------------------------------------------------------------------------------------
// Mentors (aggregate only — see docs: no mentor display names/stories exist until Module 17)
// ---------------------------------------------------------------------------------------

/** Number of verified mentors. Anon + RLS => verified rows only. No identities are read. */
export async function getVerifiedMentorCount(): Promise<number> {
  const { count, error } = await db().from("mentors").select("id", { count: "exact", head: true });
  if (error) fail("mentor count", error);
  return count ?? 0;
}
