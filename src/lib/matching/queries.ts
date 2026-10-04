import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPublicClient } from "@/lib/supabase/public";
import { loadOwnProfile } from "@/lib/profile/queries";

import type { FundingType, MatchProfile, MatchRequirement, MatchScholarship } from "./types";

/**
 * Data access for /matches (Module 09). Three deliberate rules:
 *  1. The student's own data comes from the USER's cookie-bound client (RLS: own rows only) and the user id
 *     is passed in by the page from `requireUser()` — never from the URL or the browser.
 *  2. Scholarships come from the cookie-less ANON client, so visibility is exactly what the public sees
 *     (RLS `scholarships_select_active`): drafts/archived are invisible even to admins on this page.
 *  3. Failures return a generic result; raw database messages are logged (code only) and never shown.
 */

/** Upper bound on candidate scholarships evaluated per request (the module plan expects ~100–300 in total). */
export const CANDIDATE_LIMIT = 500;

const COLUMNS = [
  "id,name,provider,status,degree_level,field,funding_type,deadline",
  "minimum_gpa,minimum_gpa_scale,english_requirement_summary,eligibility_summary",
  "countries!inner(name,slug),universities(name)",
  "scholarship_requirements(id,requirement_type,title,description,required)",
].join(",");

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : ((v as Row) ?? null));
const FUNDING: readonly string[] = ["fully_funded", "partially_funded", "not_funded"];

export function toMatchScholarship(row: Row): MatchScholarship {
  const country = one(row.countries);
  const university = one(row.universities);
  const reqs = Array.isArray(row.scholarship_requirements) ? (row.scholarship_requirements as Row[]) : [];
  return {
    id: String(row.id),
    name: String(row.name),
    provider: String(row.provider),
    status: String(row.status),
    degreeLevel: String(row.degree_level),
    field: str(row.field),
    fundingType: (FUNDING.includes(String(row.funding_type)) ? row.funding_type : "not_funded") as FundingType,
    deadline: str(row.deadline),
    country: country ? { name: String(country.name), slug: String(country.slug) } : null,
    university: university ? { name: String(university.name) } : null,
    minimumGpa: num(row.minimum_gpa),
    minimumGpaScale: num(row.minimum_gpa_scale),
    englishRequirementSummary: str(row.english_requirement_summary),
    eligibilitySummary: str(row.eligibility_summary),
    requirements: reqs.map(
      (r): MatchRequirement => ({
        id: String(r.id),
        requirementType: String(r.requirement_type),
        title: String(r.title),
        description: str(r.description),
        required: r.required !== false,
      }),
    ),
  };
}

export type LoadResult<T> = { ok: true; data: T } | { ok: false };

/** The signed-in student's profile, shaped for the engine. `userId` MUST come from the server session. */
export async function loadMatchProfile(supabase: SupabaseClient, userId: string): Promise<LoadResult<MatchProfile>> {
  try {
    const own = await loadOwnProfile(supabase, userId);
    if (!own) return { ok: false };
    return {
      ok: true,
      data: {
        nationality: own.profile.nationality,
        education: own.education.map((e) => ({
          level: e.level,
          field: e.field,
          cgpa: e.cgpa,
          cgpaScale: e.cgpa_scale,
          startDate: e.start_date,
          expectedGraduation: e.expected_graduation,
        })),
      },
    };
  } catch (e) {
    console.error("[matches] profile load failed", e instanceof Error ? e.name : "unknown");
    return { ok: false };
  }
}

/**
 * Publicly visible scholarships with their requirements in ONE query (no N+1). Closed scholarships are
 * excluded in SQL unless asked for; `deadline IS NULL` scholarships are kept (deadline not listed).
 */
export async function loadCandidateScholarships(
  includeClosed: boolean,
  todayIso: string,
): Promise<LoadResult<{ items: MatchScholarship[]; truncated: boolean }>> {
  const supabase = createPublicClient();
  if (!supabase) return { ok: false };
  try {
    let query = supabase.from("scholarships").select(COLUMNS);
    if (!includeClosed) query = query.or(`deadline.is.null,deadline.gte.${todayIso}`);
    const { data, error } = await query
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(CANDIDATE_LIMIT + 1);
    if (error) {
      console.error("[matches] scholarships query failed", error.code ?? "");
      return { ok: false };
    }
    const rows = (data ?? []) as unknown as Row[];
    const truncated = rows.length > CANDIDATE_LIMIT;
    return { ok: true, data: { items: rows.slice(0, CANDIDATE_LIMIT).map(toMatchScholarship), truncated } };
  } catch (e) {
    console.error("[matches] scholarships load failed", e instanceof Error ? e.name : "unknown");
    return { ok: false };
  }
}
