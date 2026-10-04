import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocumentRow } from "./types";

/**
 * Lists the signed-in student's own documents through the USER's cookie-bound client. RLS limits the
 * query to the caller's rows; the explicit `user_id` filter is for clarity, not for security.
 * `userId` must come from `supabase.auth.getUser()` on the server.
 *
 * Deliberately NOT selected: `user_id`, `storage_path`, `extracted_text_reference` (and
 * `processing_status`: nothing processes documents until a later module, so showing it would mislead).
 * Returns null on failure (callers show a generic message, never the raw error).
 */
export async function loadOwnDocuments(supabase: SupabaseClient, userId: string): Promise<DocumentRow[] | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, document_type, file_name, mime_type, file_size, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[documents:list]", error.code ?? "unknown_error");
    return null;
  }
  return (data ?? []).map((d) => ({ ...d, file_size: Number(d.file_size) })) as DocumentRow[];
}
