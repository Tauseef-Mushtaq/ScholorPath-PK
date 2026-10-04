import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { fetchUserRole, type Role } from "./roles";
import { LOGIN_PATH, DEFAULT_AUTHENTICATED_PATH } from "./routes";

/**
 * Display-only auth state (header, etc.). Verifies the JWT but does NOT
 * hit the Auth server on every call. Never use this to authorize access.
 */
export const getAuthState = cache(async () => {
  if (!isSupabaseConfigured()) return { isAuthenticated: false as const };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return { isAuthenticated: false as const };
  return {
    isAuthenticated: true as const,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
});

/** Authoritative user lookup (asks the Supabase Auth server). Returns null if signed out. */
export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  // Role comes from public.profiles (RLS: own row only), never from JWT/app_metadata/user_metadata.
  // A missing profile or failed lookup falls back to the least-privileged role.
  const role: Role = (await fetchUserRole(supabase, data.user.id)) ?? "student";
  return { user: data.user, role };
});

/** Server-side guard. Redirects to /login when not authenticated. */
export async function requireUser() {
  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);
  return current;
}

/** Server-side role guard. Call from pages/actions of role-restricted areas. */
export async function requireRole(allowed: readonly Role[]) {
  const current = await requireUser();
  if (!allowed.includes(current.role)) redirect(DEFAULT_AUTHENTICATED_PATH);
  return current;
}
