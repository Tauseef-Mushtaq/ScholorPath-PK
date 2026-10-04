import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Role architecture (Module 03, ADR-018 — supersedes the temporary ADR-015):
 *
 *   `public.profiles.role` is the ONLY source of truth. It is not writable by any client
 *   (column privileges + trigger + RLS); only the service role can change it via
 *   `public.set_user_role()`. Roles are never read from the JWT, `app_metadata` or
 *   `user_metadata`, and never accepted from the browser or from signup input.
 *
 * Missing/unknown values and any lookup failure resolve to the least-privileged outcome.
 */
export const ROLES = ["student", "mentor", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Validates a raw value (e.g. the `role` column). Anything unrecognised becomes "student". */
export function parseRole(value: unknown): Role {
  return (ROLES as readonly unknown[]).includes(value) ? (value as Role) : "student";
}

/**
 * Reads the signed-in user's own role from `profiles` using the USER's session (RLS applies, so a
 * user can only ever see their own row). Returns `null` if the lookup fails or no profile exists;
 * callers must treat `null` as "not authorized for role-restricted areas" (fail closed).
 */
export async function fetchUserRole(supabase: SupabaseClient, userId: string): Promise<Role | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return parseRole((data as { role?: unknown }).role);
}
