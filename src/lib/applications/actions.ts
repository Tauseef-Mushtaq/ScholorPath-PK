"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import type { ApplicationFormState } from "./types";
import {
  isUuid,
  parseApplicationStatus,
  parseNotes,
  parseOptionalDate,
  parseTaskDescription,
  parseTaskStatus,
  parseTaskTitle,
  statusSideEffects,
} from "./validation";

/**
 * Application Workspace mutations (Module 14).
 *
 * Security:
 *  - Identity from `auth.getUser()` only. Client never supplies user_id.
 *  - Cookie-bound anon-key client → RLS + column grants are the boundary.
 *  - Only allow-listed columns written. No service role.
 */

const GENERIC = "Something went wrong. Please try again.";
const UNAVAILABLE = "Applications are temporarily unavailable. Please try again later.";
const NOT_FOUND = "That application could not be found.";

function logDb(action: string, e: { code?: string }) {
  console.error(`[applications:${action}]`, e.code ?? "unknown_error");
}

async function session() {
  if (!isSupabaseConfigured()) return { error: UNAVAILABLE } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(LOGIN_PATH);
  return { supabase, userId: data.user.id } as const;
}

function revalidateApp(id?: string) {
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/applications/${id}`);
}

/** Start tracking an application for an active scholarship (or return existing). */
export async function startApplication(scholarshipId: unknown): Promise<ApplicationFormState | void> {
  if (!isUuid(scholarshipId)) return { error: "Invalid scholarship." };
  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  const existing = await ctx.supabase
    .from("applications")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("scholarship_id", scholarshipId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    logDb("start:find", existing.error);
    return { error: UNAVAILABLE };
  }
  if (existing.data?.id) {
    revalidateApp(String(existing.data.id));
    redirect(`/applications/${existing.data.id}`);
  }

  const ins = await ctx.supabase
    .from("applications")
    .insert({ user_id: ctx.userId, scholarship_id: scholarshipId, status: "planning" })
    .select("id")
    .single();
  if (ins.error || !ins.data) {
    logDb("start:insert", ins.error ?? {});
    // RLS rejects non-active scholarships as a failed insert.
    return { error: "Could not start this application. The scholarship may be closed or unavailable." };
  }
  revalidateApp(String(ins.data.id));
  redirect(`/applications/${ins.data.id}`);
}

export async function updateApplicationStatus(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const id = formData.get("applicationId");
  const status = parseApplicationStatus(formData.get("status"));
  if (!isUuid(id) || !status) return { error: "Invalid status update." };

  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  const cur = await ctx.supabase
    .from("applications")
    .select("id,status")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (cur.error) {
    logDb("status:load", cur.error);
    return { error: UNAVAILABLE };
  }
  if (!cur.data) return { error: NOT_FOUND };

  const prev = parseApplicationStatus(cur.data.status) ?? "planning";
  const effects = statusSideEffects(status, prev);
  const patch: Record<string, unknown> = { status };
  if (effects.startedAt) patch.started_at = new Date().toISOString();
  if (effects.submittedAt) patch.submitted_at = new Date().toISOString();
  if (effects.clearSubmittedAt) patch.submitted_at = null;

  const { error } = await ctx.supabase.from("applications").update(patch).eq("id", id).eq("user_id", ctx.userId);
  if (error) {
    logDb("status:update", error);
    return { error: GENERIC };
  }
  revalidateApp(id);
  return { success: "Status updated." };
}

export async function updateApplicationNotes(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const id = formData.get("applicationId");
  const notes = parseNotes(formData.get("notes"));
  if (!isUuid(id)) return { error: "Invalid application." };
  if (!notes.ok) return { error: notes.message };

  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  const { data, error } = await ctx.supabase
    .from("applications")
    .update({ notes: notes.value })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("id")
    .maybeSingle();
  if (error) {
    logDb("notes", error);
    return { error: GENERIC };
  }
  if (!data) return { error: NOT_FOUND };
  revalidateApp(id);
  return { success: "Notes saved." };
}

export async function updateTaskStatus(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const taskId = formData.get("taskId");
  const applicationId = formData.get("applicationId");
  const status = parseTaskStatus(formData.get("status"));
  if (!isUuid(taskId) || !isUuid(applicationId) || !status) return { error: "Invalid task update." };

  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  // Prove the application belongs to the caller before updating the task (defence in depth on top of RLS).
  const owned = await ctx.supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (owned.error) {
    logDb("task:own", owned.error);
    return { error: UNAVAILABLE };
  }
  if (!owned.data) return { error: NOT_FOUND };

  const { data, error } = await ctx.supabase
    .from("application_tasks")
    .update({ status })
    .eq("id", taskId)
    .eq("application_id", applicationId)
    .select("id")
    .maybeSingle();
  if (error) {
    logDb("task:status", error);
    return { error: GENERIC };
  }
  if (!data) return { error: "That task could not be found." };
  revalidateApp(applicationId);
  return { success: "Task updated." };
}

export async function addTask(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const applicationId = formData.get("applicationId");
  const title = parseTaskTitle(formData.get("title"));
  const description = parseTaskDescription(formData.get("description"));
  const dueDate = parseOptionalDate(formData.get("dueDate"));
  const required = formData.get("required") !== "false";
  if (!isUuid(applicationId)) return { error: "Invalid application." };
  if (!title) return { error: "Task title must be at least 3 characters." };

  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  const owned = await ctx.supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (owned.error) {
    logDb("addTask:own", owned.error);
    return { error: UNAVAILABLE };
  }
  if (!owned.data) return { error: NOT_FOUND };

  const { error } = await ctx.supabase.from("application_tasks").insert({
    application_id: applicationId,
    title,
    description,
    due_date: dueDate,
    required,
    status: "todo",
  });
  if (error) {
    logDb("addTask", error);
    return { error: GENERIC };
  }
  revalidateApp(applicationId);
  return { success: "Task added." };
}

export async function deleteApplication(applicationId: unknown): Promise<ApplicationFormState | void> {
  if (!isUuid(applicationId)) return { error: "Invalid application." };
  const ctx = await session();
  if ("error" in ctx) return { error: ctx.error };

  const { data, error } = await ctx.supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("user_id", ctx.userId)
    .select("id")
    .maybeSingle();
  if (error) {
    logDb("delete", error);
    return { error: GENERIC };
  }
  if (!data) return { error: NOT_FOUND };
  revalidateApp();
  redirect("/applications");
}
