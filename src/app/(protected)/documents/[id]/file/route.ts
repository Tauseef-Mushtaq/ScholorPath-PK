import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { SIGNED_URL_TTL_SECONDS, DOCUMENTS_BUCKET } from "@/lib/documents/constants";
import { isStoragePathForUser, isUuid } from "@/lib/documents/validation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Auth-dependent: never cache or prerender.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } as const;

/**
 * GET /documents/[id]/file            -> view in the browser (PDF/images open inline; DOCX downloads)
 * GET /documents/[id]/file?download=1 -> force download with the stored display name
 *
 * 1. authenticate from the session  2. look the row up with the caller's OWN client and `user_id` filter
 * 3. mint a short-lived signed URL for the path read from that row  4. 302 to it.
 * The browser supplies only the document id; never a user id or a storage path. Unknown, foreign and
 * malformed ids all get the same generic 404, so the route is not an existence oracle. The signed URL
 * lives on the Supabase Storage origin (not this app's origin) and expires after SIGNED_URL_TTL_SECONDS.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = () =>
    new Response("We couldn't access that document.", {
      status: 404,
      headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
    });

  const { id } = await params;
  if (!isSupabaseConfigured() || !isUuid(id)) return denied();

  const supabase = await createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth.user) redirect(LOGIN_PATH);
  const userId = auth.user.id;

  try {
    const { data: row, error } = await supabase
      .from("documents")
      .select("storage_path, file_name")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !row || !isStoragePathForUser(row.storage_path, userId)) return denied();

    const download = new URL(request.url).searchParams.get("download") === "1";
    const { data: signed, error: signErr } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, download ? { download: row.file_name } : undefined);
    if (signErr || !signed?.signedUrl) {
      console.error("[documents:sign]", signErr?.name ?? "unknown_error");
      return denied();
    }

    return new Response(null, { status: 302, headers: { ...NO_STORE, Location: signed.signedUrl } });
  } catch {
    console.error("[documents:sign] unexpected_error");
    return denied();
  }
}
