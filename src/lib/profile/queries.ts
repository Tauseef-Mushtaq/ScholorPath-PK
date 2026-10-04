import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EducationRow, ExperienceRow, ProfileRow } from "./types";

export type OwnProfileData = {
  profile: ProfileRow;
  education: EducationRow[];
  experiences: ExperienceRow[];
};

export type OwnProfileResult =
  | { status: "ok"; data: OwnProfileData }
  | { status: "missing" }   // the query worked and this user has no profiles row
  | { status: "error" };    // a query failed: NOT the same as "no data"

/**
 * Loads the signed-in student's own profile, education and experience through the USER's
 * Supabase client. RLS limits every query to the caller's rows; the explicit filters keep it to the caller
 * even for a role whose RLS policy is wider (admins may read every profile). `userId` must come from
 * `supabase.auth.getUser()` on the server. Distinguishes "no profile row" from "query failed" so callers never
 * report a failure as an empty profile (or the reverse).
 */
export async function loadOwnProfileResult(supabase: SupabaseClient, userId: string): Promise<OwnProfileResult> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, nationality, city")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { status: "error" };
  if (!profile) return { status: "missing" };

  const [edu, exp] = await Promise.all([
    supabase
      .from("education")
      .select("id, level, degree_name, field, institution, cgpa, cgpa_scale, start_date, expected_graduation")
      .eq("profile_id", profile.id)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("experiences")
      .select("id, experience_type, title, organization, description, start_date, end_date")
      .eq("profile_id", profile.id)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);
  if (edu.error || exp.error) return { status: "error" };

  return {
    status: "ok",
    data: {
      profile: profile as ProfileRow,
      education: (edu.data ?? []).map((e) => ({
        ...e,
        cgpa: e.cgpa === null ? null : Number(e.cgpa),
        cgpa_scale: e.cgpa_scale === null ? null : Number(e.cgpa_scale),
      })) as EducationRow[],
      experiences: (exp.data ?? []) as ExperienceRow[],
    },
  };
}

/** Existing contract (profile page, Module 09): the data, or null when missing OR failed. */
export async function loadOwnProfile(supabase: SupabaseClient, userId: string): Promise<OwnProfileData | null> {
  const r = await loadOwnProfileResult(supabase, userId);
  return r.status === "ok" ? r.data : null;
}
