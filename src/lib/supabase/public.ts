import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/lib/env";

/**
 * Anonymous, cookie-less Supabase client for PUBLIC reads (scholarships, countries, mentors).
 *
 * - Anon key only; never the service role. Row Level Security still applies (role = `anon`).
 * - Does not read cookies, so public pages never depend on who is signed in and results are
 *   identical for every visitor (e.g. mentor counts are always "verified only").
 * - No session persistence / token refresh: it is a stateless client.
 *
 * Returns null when Supabase env is not configured so callers can render a safe fallback
 * instead of crashing the build or the page.
 */
export function createPublicClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
