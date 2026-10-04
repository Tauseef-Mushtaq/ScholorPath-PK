import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isDraftType, type DraftType } from "./constants";
import type { ApplicationDraft } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

function mapDraft(r: Row): ApplicationDraft {
  const rawType = String(r.draft_type ?? "");
  const draftType: DraftType = isDraftType(rawType) ? rawType : "sop";
  return {
    id: String(r.id),
    applicationId: String(r.application_id),
    draftType,
    title: str(r.title),
    content: String(r.content ?? ""),
    version: typeof r.version === "number" ? r.version : Number(r.version) || 1,
    aiGenerated: r.ai_generated === true,
    userApproved: r.user_approved === true,
    promptSummary: str(r.prompt_summary),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

/** List drafts for an application the caller owns (RLS + explicit application_id). */
export async function loadDraftsForApplication(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<ApplicationDraft[] | null> {
  const { data, error } = await supabase
    .from("application_drafts")
    .select("id,application_id,draft_type,title,content,version,ai_generated,user_approved,prompt_summary,created_at,updated_at")
    .eq("application_id", applicationId)
    .order("updated_at", { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => mapDraft(r as Row));
}

export async function loadDraftById(
  supabase: SupabaseClient,
  draftId: string,
): Promise<ApplicationDraft | null> {
  const { data, error } = await supabase
    .from("application_drafts")
    .select("id,application_id,draft_type,title,content,version,ai_generated,user_approved,prompt_summary,created_at,updated_at")
    .eq("id", draftId)
    .maybeSingle();
  if (error || !data) return null;
  return mapDraft(data as Row);
}
