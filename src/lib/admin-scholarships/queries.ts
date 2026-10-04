import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { AdminScholarshipFull, AdminScholarshipRow, AdminSource, Option } from "./types";
import { ADMIN_PAGE_SIZE, isStatus, isUuid, type AdminListFilters } from "./validation";

/**
 * Admin read layer. Callers (pages) must already have passed `requireRole(["admin"])`.
 * Uses the cookie-bound client, so RLS (`scholarships_admin_all`, `is_admin()`) is still the
 * enforcement layer: a non-admin session would simply see no draft/archived rows. Explicit columns only.
 */

export class AdminDataError extends Error {
  constructor(scope: string) {
    super(`${scope} failed`);
    this.name = "AdminDataError";
  }
}

function fail(scope: string, error: { code?: string }): never {
  console.error(`[admin-scholarships:${scope}]`, error.code ?? "unknown_error");
  throw new AdminDataError(scope);
}

type Row = Record<string, unknown>;
const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));
const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export const FORM_COLUMNS =
  "name,provider,country_id,university_id,degree_level,field,funding_type,tuition_coverage,stipend_details,accommodation_details,travel_details,insurance_details,eligibility_summary,minimum_gpa,minimum_gpa_scale,english_requirement_summary,application_fee,opening_date,deadline,official_information_url,official_application_url";

export async function listAdminScholarships(filters: AdminListFilters): Promise<{ items: AdminScholarshipRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("scholarships")
    .select("id,name,provider,status,deadline,updated_at,countries(name),universities(name)", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.q) query = query.or(`name.ilike.%${filters.q}%,provider.ilike.%${filters.q}%`);
  const from = (filters.page - 1) * ADMIN_PAGE_SIZE;
  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error) fail("list", error);
  const items = ((data ?? []) as unknown as Row[]).map((r): AdminScholarshipRow => ({
    id: s(r.id),
    name: s(r.name),
    provider: s(r.provider),
    status: isStatus(r.status) ? r.status : "draft",
    deadline: r.deadline ? s(r.deadline) : null,
    updatedAt: s(r.updated_at),
    country: one<Row>(r.countries) ? s(one<Row>(r.countries)!.name) : null,
    university: one<Row>(r.universities) ? s(one<Row>(r.universities)!.name) : null,
  }));
  return { items, total: count ?? 0 };
}

export async function getAdminScholarship(id: string): Promise<AdminScholarshipFull | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scholarships")
    .select(`id,status,last_verified_at,created_at,updated_at,${FORM_COLUMNS}`)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("get", error);
  if (!data) return null;
  const r = data as unknown as Row;
  const values: Record<string, string> = {};
  for (const col of FORM_COLUMNS.split(",")) values[col] = s(r[col]);
  return {
    id: s(r.id),
    status: isStatus(r.status) ? r.status : "draft",
    lastVerifiedAt: r.last_verified_at ? s(r.last_verified_at) : null,
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
    values,
  };
}

export async function listCountryOptions(): Promise<Option[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("countries").select("id,name").order("name", { ascending: true }).limit(500);
  if (error) fail("countries", error);
  return ((data ?? []) as unknown as Row[]).map((r) => ({ value: s(r.id), label: s(r.name) }));
}

export type UniversityOption = Option & { countryId: string };
export async function listUniversityOptions(): Promise<UniversityOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("universities").select("id,name,country_id").order("name", { ascending: true }).limit(2000);
  if (error) fail("universities", error);
  return ((data ?? []) as unknown as Row[]).map((r) => ({ value: s(r.id), label: s(r.name), countryId: s(r.country_id) }));
}

export async function listSources(scholarshipId: string): Promise<AdminSource[]> {
  if (!isUuid(scholarshipId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scholarship_sources")
    .select("id,source_url,source_name,source_type,priority,active,last_verified_at")
    .eq("scholarship_id", scholarshipId)
    .order("priority", { ascending: true })
    .order("id", { ascending: true })
    .limit(100);
  if (error) fail("sources", error);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: s(r.id),
    sourceUrl: s(r.source_url),
    sourceName: r.source_name ? s(r.source_name) : null,
    sourceType: r.source_type ? s(r.source_type) : null,
    priority: Number(r.priority ?? 0),
    active: r.active === true,
    lastVerifiedAt: r.last_verified_at ? s(r.last_verified_at) : null,
  }));
}

/** Number of applications referencing a scholarship (admins can read all applications under RLS). */
export async function countApplications(scholarshipId: string): Promise<number | null> {
  if (!isUuid(scholarshipId)) return null;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("scholarship_id", scholarshipId);
  if (error) {
    console.error("[admin-scholarships:applications-count]", error.code ?? "unknown_error");
    return null;
  }
  return count ?? 0;
}
