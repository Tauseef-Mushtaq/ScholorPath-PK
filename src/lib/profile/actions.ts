"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import type { ProfileFormState } from "./types";
import { isUuid, validateEducation, validateExperience, validateProfile, type Result } from "./validation";

/**
 * Student profile mutations.
 *
 * Security model (Module 05):
 *  - The user comes ONLY from the server-side session (`auth.getUser()`); the browser never supplies
 *    a user id, profile id or owner id. Ownership of new rows is derived from the caller's own profile.
 *  - All writes go through the normal cookie-bound anon-key client, so RLS and the Module 03 column
 *    grants stay the enforcement layer. The service-role client is never imported here.
 *  - Only whitelisted columns are ever sent (see validation.ts); `role`, `user_id` etc. are never sent.
 *  - Database errors are logged by code only and replaced by generic messages.
 */

const GENERIC = "Something went wrong. Please try again.";
const UNAVAILABLE = "Your profile is temporarily unavailable. Please try again later.";
const NOT_FOUND = "That record could not be found. It may have been deleted already.";

function logDbError(action: string, e: { code?: string }) {
  console.error(`[profile:${action}]`, e.code ?? "unknown_error");
}

function friendly(e: { code?: string }): string {
  switch (e.code) {
    case "23514": // check_violation
    case "22003": // numeric_value_out_of_range
    case "22007": // invalid_datetime_format
    case "22008": // datetime_field_overflow
    case "22001": // string_data_right_truncation
    case "22P02": // invalid_text_representation
      return "Some of the values you entered are not allowed. Please check the form and try again.";
    default:
      return GENERIC;
  }
}

/** Resolves the authenticated user and the user's own profile id, or an error state. */
async function context(action: string) {
  if (!isSupabaseConfigured()) return { error: UNAVAILABLE } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(LOGIN_PATH);

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (pErr) logDbError(`${action}:profile`, pErr);
  if (pErr || !profile) return { error: UNAVAILABLE } as const;
  return { supabase, userId: data.user.id, profileId: profile.id as string };
}

function invalid<T>(r: Extract<Result<T>, { ok: false }>): ProfileFormState {
  return { error: "Please fix the highlighted fields.", fieldErrors: r.errors, values: r.values };
}

function recordId(formData: FormData): string | null {
  const v = formData.get("id");
  if (typeof v !== "string" || v === "") return "";
  return isUuid(v) ? v : null;
}

// ---------------------------------------------------------------------------------------------
export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const v = validateProfile(formData);
  if (!v.ok) return invalid(v);

  const ctx = await context("updateProfile");
  if ("error" in ctx) return { error: ctx.error, values: v.values };

  // Only the whitelisted, client-writable columns. Targets the caller's own row; RLS re-checks it.
  const { data, error } = await ctx.supabase
    .from("profiles")
    .update(v.data)
    .eq("user_id", ctx.userId)
    .select("id");
  if (error) {
    logDbError("updateProfile", error);
    return { error: friendly(error), values: v.values };
  }
  if (!data || data.length === 0) return { error: UNAVAILABLE, values: v.values };

  revalidatePath("/profile");
  return { success: "Profile saved.", values: v.values };
}

// ---------------------------------------------------------------------------------------------
export async function saveEducation(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const id = recordId(formData);
  if (id === null) return { error: NOT_FOUND };
  const v = validateEducation(formData);
  if (!v.ok) return invalid(v);

  const ctx = await context("saveEducation");
  if ("error" in ctx) return { error: ctx.error, values: v.values };

  if (id === "") {
    // profile_id comes from the caller's own profile, never from the browser; RLS re-checks it.
    const { error } = await ctx.supabase.from("education").insert({ profile_id: ctx.profileId, ...v.data });
    if (error) {
      logDbError("saveEducation:insert", error);
      return { error: friendly(error), values: v.values };
    }
  } else {
    // profile_id is not updatable (no column grant). RLS makes a foreign id match zero rows.
    const { data, error } = await ctx.supabase.from("education").update(v.data).eq("id", id).select("id");
    if (error) {
      logDbError("saveEducation:update", error);
      return { error: friendly(error), values: v.values };
    }
    if (!data || data.length === 0) return { error: NOT_FOUND, values: v.values };
  }

  revalidatePath("/profile");
  return { success: id === "" ? "Education added." : "Education updated." };
}

export async function deleteEducation(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const id = recordId(formData);
  if (!id) return { error: NOT_FOUND };
  const ctx = await context("deleteEducation");
  if ("error" in ctx) return { error: ctx.error };

  const { data, error } = await ctx.supabase.from("education").delete().eq("id", id).select("id");
  if (error) {
    logDbError("deleteEducation", error);
    return { error: GENERIC };
  }
  if (!data || data.length === 0) return { error: NOT_FOUND };
  revalidatePath("/profile");
  return { success: "Education deleted." };
}

// ---------------------------------------------------------------------------------------------
export async function saveExperience(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const id = recordId(formData);
  if (id === null) return { error: NOT_FOUND };
  const v = validateExperience(formData);
  if (!v.ok) return invalid(v);

  const ctx = await context("saveExperience");
  if ("error" in ctx) return { error: ctx.error, values: v.values };

  if (id === "") {
    const { error } = await ctx.supabase.from("experiences").insert({ profile_id: ctx.profileId, ...v.data });
    if (error) {
      logDbError("saveExperience:insert", error);
      return { error: friendly(error), values: v.values };
    }
  } else {
    const { data, error } = await ctx.supabase.from("experiences").update(v.data).eq("id", id).select("id");
    if (error) {
      logDbError("saveExperience:update", error);
      return { error: friendly(error), values: v.values };
    }
    if (!data || data.length === 0) return { error: NOT_FOUND, values: v.values };
  }

  revalidatePath("/profile");
  return { success: id === "" ? "Experience added." : "Experience updated." };
}

export async function deleteExperience(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const id = recordId(formData);
  if (!id) return { error: NOT_FOUND };
  const ctx = await context("deleteExperience");
  if ("error" in ctx) return { error: ctx.error };

  const { data, error } = await ctx.supabase.from("experiences").delete().eq("id", id).select("id");
  if (error) {
    logDbError("deleteExperience", error);
    return { error: GENERIC };
  }
  if (!data || data.length === 0) return { error: NOT_FOUND };
  revalidatePath("/profile");
  return { success: "Experience deleted." };
}
