"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import type { DraftFormState } from "./types";
import {
  isUuid,
  parseContent,
  parseDraftType,
  parsePromptSummary,
  parseTitle,
} from "./validation";

/**
 * Application Copilot mutations (Module 15).
 * Session identity only; RLS + owns_application; no service role.
 */

const GENERIC = "Something went wrong. Please try again.";
const UNAVAILABLE = "Drafts are temporarily unavailable. Please try again later.";

function logDb(action: string, e: { code?: string }) {
  console.error(`[copilot:${action}]`, e.code ?? "unknown_error");
}

async function session() {
  if (!isSupabaseConfigured()) return { error: UNAVAILABLE } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(LOGIN_PATH);
  return { supabase, userId: data.user.id } as const;
}

function revalidateApp(applicationId: string) {
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
}

/** Save a new draft version for an owned application. */
export async function saveDraft(input: {
  applicationId: unknown;
  draftType: unknown;
  title?: unknown;
  content: unknown;
  aiGenerated?: unknown;
  promptSummary?: unknown;
}): Promise<DraftFormState> {
  const applicationId = isUuid(input.applicationId) ? input.applicationId : null;
  if (!applicationId) return { error: "Invalid application." };
  const draftType = parseDraftType(input.draftType);
  if (!draftType) return { error: "Invalid draft type." };
  const content = parseContent(input.content);
  if (typeof content === "object") return { error: content.error };
  const title = parseTitle(input.title);
  if (title && typeof title === "object" && "error" in title) return { error: title.error };
  const promptSummary = parsePromptSummary(input.promptSummary);
  if (promptSummary && typeof promptSummary === "object" && "error" in promptSummary) {
    return { error: promptSummary.error };
  }

  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  // Ownership: must see the application row (RLS + user_id).
  const app = await ctx.supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (app.error) {
    logDb("save:app", app.error);
    return { error: GENERIC };
  }
  if (!app.data) return { error: "Application not found." };

  // Next version for this type (best-effort; not a unique constraint).
  const latest = await ctx.supabase
    .from("application_drafts")
    .select("version")
    .eq("application_id", applicationId)
    .eq("draft_type", draftType)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion =
    latest.data && typeof latest.data.version === "number" ? latest.data.version + 1 : 1;

  const insert = await ctx.supabase
    .from("application_drafts")
    .insert({
      application_id: applicationId,
      draft_type: draftType,
      title: typeof title === "string" ? title : null,
      content,
      version: nextVersion,
      ai_generated: input.aiGenerated === true,
      user_approved: false,
      prompt_summary: typeof promptSummary === "string" ? promptSummary : null,
    })
    .select("id")
    .single();

  if (insert.error) {
    logDb("save:insert", insert.error);
    return { error: GENERIC };
  }

  revalidateApp(applicationId);
  return { success: "Draft saved.", draftId: insert.data.id };
}

/** Mark a draft as reviewed/approved by the student. */
export async function approveDraft(draftId: unknown, applicationId: unknown): Promise<DraftFormState> {
  if (!isUuid(draftId) || !isUuid(applicationId)) return { error: "Invalid request." };
  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  const upd = await ctx.supabase
    .from("application_drafts")
    .update({ user_approved: true })
    .eq("id", draftId)
    .eq("application_id", applicationId)
    .select("id")
    .maybeSingle();

  if (upd.error) {
    logDb("approve", upd.error);
    return { error: GENERIC };
  }
  if (!upd.data) return { error: "Draft not found." };

  revalidateApp(applicationId);
  return { success: "Marked as reviewed." };
}

/** Delete an owned draft. */
export async function deleteDraft(draftId: unknown, applicationId: unknown): Promise<DraftFormState> {
  if (!isUuid(draftId) || !isUuid(applicationId)) return { error: "Invalid request." };
  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  const del = await ctx.supabase
    .from("application_drafts")
    .delete()
    .eq("id", draftId)
    .eq("application_id", applicationId)
    .select("id")
    .maybeSingle();

  if (del.error) {
    logDb("delete", del.error);
    return { error: GENERIC };
  }
  if (!del.data) return { error: "Draft not found." };

  revalidateApp(applicationId);
  return { success: "Draft deleted." };
}

/** Update content of an existing draft (manual edit). */
export async function updateDraftContent(input: {
  draftId: unknown;
  applicationId: unknown;
  content: unknown;
  title?: unknown;
}): Promise<DraftFormState> {
  if (!isUuid(input.draftId) || !isUuid(input.applicationId)) return { error: "Invalid request." };
  const content = parseContent(input.content);
  if (typeof content === "object") return { error: content.error };
  const title = parseTitle(input.title);
  if (title && typeof title === "object" && "error" in title) return { error: title.error };

  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  const patch: Record<string, unknown> = { content, user_approved: false };
  if (title !== undefined && !(title && typeof title === "object")) {
    patch.title = title;
  }

  const upd = await ctx.supabase
    .from("application_drafts")
    .update(patch)
    .eq("id", input.draftId)
    .eq("application_id", input.applicationId)
    .select("id")
    .maybeSingle();

  if (upd.error) {
    logDb("update", upd.error);
    return { error: GENERIC };
  }
  if (!upd.data) return { error: "Draft not found." };

  revalidateApp(input.applicationId);
  return { success: "Draft updated." };
}
