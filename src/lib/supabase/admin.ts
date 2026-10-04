import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/env";
import { getSupabaseServiceRoleKey } from "@/lib/env.server";

/**
 * Service-role client. BYPASSES RLS. Server-only; use for narrow, validated
 * operations after authorization has been checked server-side.
 */
export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  return createClient(url, getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
