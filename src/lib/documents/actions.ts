"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { DOCUMENTS_BUCKET, MAX_FILE_SIZE_BYTES } from "./constants";
import type { DocumentFormState } from "./types";
import { buildStoragePath, isStoragePathForUser, isUuid, MESSAGES, parseDocumentType, validateUpload } from "./validation";

/**
 * Document Vault mutations (Module 06).
 *
 * Security model:
 *  - The user comes ONLY from the server session (`auth.getUser()`). The browser sends a file, an optional
 *    allow-listed document type, and (for delete) a record id. It never sends a user id, owner id, profile
 *    id or storage path.
 *  - Everything runs on the cookie-bound anon-key client, so RLS and the Storage policies stay the
 *    enforcement layer. The service-role client is never imported here.
 *  - File type, extension, size and signature are validated server-side from the actual bytes; the stored
 *    MIME type is derived on the server. The object path is `<session user id>/<random uuid>.<ext>`.
 *  - Raw Supabase/Storage errors are never returned; only safe codes are logged (never file contents,
 *    tokens, keys, or the original file name).
 */

const UNAVAILABLE = "Your documents are temporarily unavailable. Please try again later.";
const UPLOAD_FAILED = "We couldn't upload this document. Please try again.";
const DELETE_FAILED = "We couldn't delete this document. Please try again.";
const NOT_FOUND = "That document could not be found. It may have been deleted already.";

type ErrLike = { code?: string; name?: string; statusCode?: string | number } | null | undefined;

function logSafe(where: string, e: ErrLike) {
  console.error(`[documents:${where}]`, e?.code ?? e?.statusCode ?? e?.name ?? "unknown_error");
}

function isFileLike(v: unknown): v is File {
  return typeof v === "object" && v !== null && typeof (v as File).arrayBuffer === "function" && typeof (v as File).size === "number";
}

/** Authenticates from the session. Redirects guests to /login (same as the profile actions). */
async function authenticate() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(LOGIN_PATH);
  return { supabase, userId: data.user.id };
}

// ---------------------------------------------------------------------------------------------
export async function uploadDocument(_prev: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  if (!isSupabaseConfigured()) return { error: UNAVAILABLE };
  const { supabase, userId } = await authenticate();

  const file = formData.get("file");
  if (!isFileLike(file) || (file.size === 0 && !file.name)) return { error: MESSAGES.noFile };
  // `size` is the server's own count of the parsed part; reject before buffering anything large.
  if (file.size > MAX_FILE_SIZE_BYTES) return { error: MESSAGES.tooLarge };

  const documentType = parseDocumentType(formData.get("document_type"));
  if (documentType === undefined) return { error: MESSAGES.badType };

  let path: string | null = null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateUpload({ name: file.name, clientType: file.type, bytes });
    if (!check.ok) return { error: check.message };

    path = buildStoragePath(userId, check.mime);
    const { error: upErr } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, bytes, { contentType: check.mime, upsert: false });
    if (upErr) {
      logSafe("upload:storage", upErr);
      return { error: UPLOAD_FAILED };
    }

    // user_id is the session user; the DB CHECK + RLS re-verify it and the folder.
    const { error: insErr } = await supabase.from("documents").insert({
      user_id: userId,
      document_type: documentType,
      file_name: check.displayName,
      storage_path: path,
      mime_type: check.mime,
      file_size: bytes.byteLength,
    });
    if (insErr) {
      logSafe("upload:insert", insErr);
      // Roll back the object so no orphan is left behind.
      const { error: cleanupErr } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
      if (cleanupErr) logSafe("upload:cleanup", cleanupErr);
      return { error: UPLOAD_FAILED };
    }

    revalidatePath("/documents");
    return { success: `Uploaded “${check.displayName}”.` };
  } catch (e) {
    logSafe("upload:unexpected", e as ErrLike);
    if (path) {
      try {
        await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
      } catch {
        /* best effort; nothing sensitive to log */
      }
    }
    return { error: UPLOAD_FAILED };
  }
}

// ---------------------------------------------------------------------------------------------
/**
 * Order of operations: Storage object first, then the database row.
 *  - Storage fails  -> nothing changed; the row still exists and the user can retry.
 *  - Storage succeeds, DB delete fails -> the row remains (the file is gone). The row is still visible and
 *    deletable; retrying is safe because removing a missing object is a no-op. Nothing is hidden or orphaned.
 *  The reverse order could leave an invisible, undeletable object in private storage.
 * The target row is first looked up with the caller's own client + `user_id` filter, so a forged id (or a
 * forged path) can never reach another user's object: the storage path always comes from the caller's own row.
 */
export async function deleteDocument(_prev: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  const id = formData.get("id");
  if (!isUuid(id)) return { error: NOT_FOUND };
  if (!isSupabaseConfigured()) return { error: UNAVAILABLE };
  const { supabase, userId } = await authenticate();

  try {
    const { data: row, error: selErr } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr) {
      logSafe("delete:lookup", selErr);
      return { error: DELETE_FAILED };
    }
    if (!row) return { error: NOT_FOUND };
    if (!isStoragePathForUser(row.storage_path, userId)) {
      console.error("[documents:delete] unexpected_storage_path");
      return { error: DELETE_FAILED };
    }

    const bucket = supabase.storage.from(DOCUMENTS_BUCKET);
    const { data: removed, error: rmErr } = await bucket.remove([row.storage_path]);
    if (rmErr) {
      logSafe("delete:storage", rmErr);
      return { error: DELETE_FAILED };
    }
    if (!removed || removed.length === 0) {
      // Storage reports success for objects it could not see/delete. Only continue if it is really gone.
      const { data: stillThere, error: exErr } = await bucket.exists(row.storage_path);
      if (exErr || stillThere) {
        logSafe("delete:storage_verify", exErr);
        return { error: DELETE_FAILED };
      }
    }

    const { error: delErr } = await supabase.from("documents").delete().eq("id", row.id).eq("user_id", userId);
    if (delErr) {
      logSafe("delete:row", delErr);
      return { error: DELETE_FAILED };
    }

    revalidatePath("/documents");
    return { success: "Document deleted." };
  } catch (e) {
    logSafe("delete:unexpected", e as ErrLike);
    return { error: DELETE_FAILED };
  }
}
