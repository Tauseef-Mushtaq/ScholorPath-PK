"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fetchUserRole } from "@/lib/auth/roles";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { parseImportJson } from "./import";
import { publishBlockers } from "./readiness";
import type { AdminFormState } from "./types";
import {
  canTransition, isStatus, isUuid, validateScholarship, validateSource,
  type Raw, type ScholarshipStatus,
} from "./validation";

/**
 * Module 07 admin mutations.
 *
 * Every exported action: (1) authenticates with auth.getUser() (server-verified), (2) requires
 * profiles.role === "admin" read with the caller's own session, (3) validates with an explicit
 * allow-list, (4) writes through the cookie-bound client so RLS (`is_admin()`) stays authoritative,
 * (5) replaces database errors with generic messages (only the error CODE is logged).
 * The service-role client is NOT used anywhere in this module. A `role` field in a form is ignored.
 */

const GENERIC = "Something went wrong. Please try again.";
const UNAVAILABLE = "Scholarship management is temporarily unavailable. Please try again later.";
const FORBIDDEN = "You do not have permission to do that.";
const NOT_FOUND = "That scholarship could not be found. It may have been deleted.";
const BAD_ID = "That request was not valid.";

function logDb(action: string, e: { code?: string }) {
  console.error(`[admin-scholarships:${action}]`, e.code ?? "unknown_error");
}

function friendly(e: { code?: string }): string {
  switch (e.code) {
    case "23505": return "A record with those details already exists.";
    case "23503": return "A related record (country, university or applications) prevents that change.";
    case "23514": case "22003": case "22007": case "22008": case "22001": case "22P02":
      return "Some of the values you entered are not allowed. Please check the form and try again.";
    case "42501": return FORBIDDEN;
    default: return GENERIC;
  }
}

async function adminContext() {
  if (!isSupabaseConfigured()) return { error: UNAVAILABLE } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(LOGIN_PATH);
  const role = await fetchUserRole(supabase, data.user.id); // authoritative: profiles.role, own row
  if (role !== "admin") return { error: FORBIDDEN } as const;
  return { supabase, userId: data.user.id } as const;
}
type Ctx = Exclude<Awaited<ReturnType<typeof adminContext>>, { error: string }>;

/** Best-effort append-only audit (docs/SECURITY.md). Stores field NAMES / counts, never values. */
async function audit(ctx: Ctx, actionType: string, targetId: string | null, metadata: Record<string, unknown>) {
  const { error } = await ctx.supabase.from("admin_actions").insert({
    admin_user_id: ctx.userId, action_type: actionType, target_type: "scholarship", target_id: targetId, metadata,
  });
  if (error) logDb(`audit:${actionType}`, error);
}

function refresh(id?: string) {
  revalidatePath("/");
  revalidatePath("/scholarships");
  revalidatePath("/countries");
  revalidatePath("/countries/[country]", "page");
  revalidatePath("/admin/scholarships");
  if (id) {
    revalidatePath(`/scholarships/${id}`);
    revalidatePath(`/admin/scholarships/${id}`);
  }
}

function recordId(raw: Raw, key = "id"): string | null {
  const v = raw instanceof FormData ? raw.get(key) : raw[key];
  return typeof v === "string" && isUuid(v) ? v : null;
}

/** Country must exist; a chosen university must belong to that country (the DB does not enforce this). */
async function checkRelations(ctx: Ctx, countryId: string, universityId: string | null): Promise<Record<string, string> | null> {
  const { data: c, error: ce } = await ctx.supabase.from("countries").select("id").eq("id", countryId).maybeSingle();
  if (ce) { logDb("check-country", ce); return { _: GENERIC }; }
  if (!c) return { country_id: "Choose a valid country." };
  if (universityId) {
    const { data: u, error: ue } = await ctx.supabase.from("universities").select("id,country_id").eq("id", universityId).maybeSingle();
    if (ue) { logDb("check-university", ue); return { _: GENERIC }; }
    if (!u) return { university_id: "Choose a valid university." };
    if ((u as { country_id: string }).country_id !== countryId) return { university_id: "That university is not in the selected country." };
  }
  return null;
}

function invalid(errors: Record<string, string>, values: Record<string, string>): AdminFormState {
  const { _, ...fieldErrors } = errors;
  return { error: _ ?? "Please fix the highlighted fields.", fieldErrors, values };
}

// ---------------------------------------------------------------------------------------------
export async function createScholarship(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };

  const v = validateScholarship(formData);
  if (!v.ok) return invalid(v.errors, v.values);
  const rel = await checkRelations(ctx, v.data.country_id, v.data.university_id);
  if (rel) return invalid(rel, v.values);

  // Soft duplicate guard (there is no unique constraint): same name + provider + country.
  const { data: dup, error: de } = await ctx.supabase
    .from("scholarships").select("id").eq("name", v.data.name).eq("provider", v.data.provider).eq("country_id", v.data.country_id).limit(1);
  if (de) { logDb("create:dup", de); return { error: GENERIC, values: v.values }; }
  if (dup && dup.length) return { error: "A scholarship with the same name, provider and country already exists.", values: v.values };

  // status is ALWAYS draft on create: publishing is a separate, explicit action.
  const { data, error } = await ctx.supabase.from("scholarships").insert({ ...v.data, status: "draft" }).select("id").single();
  if (error || !data) { if (error) logDb("create", error); return { error: error ? friendly(error) : GENERIC, values: v.values }; }
  const id = (data as { id: string }).id;
  await audit(ctx, "scholarship.create", id, { status: "draft" });
  refresh(id);
  return { success: "Scholarship created as a draft. It is not public until you publish it.", redirectTo: `/admin/scholarships/${id}`, values: v.values };
}

export async function updateScholarship(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };
  const id = recordId(formData);
  if (!id) return { error: BAD_ID };

  const v = validateScholarship(formData);
  if (!v.ok) return invalid(v.errors, v.values);
  const rel = await checkRelations(ctx, v.data.country_id, v.data.university_id);
  if (rel) return invalid(rel, v.values);

  const { data, error } = await ctx.supabase.from("scholarships").update(v.data).eq("id", id).select("id");
  if (error) { logDb("update", error); return { error: friendly(error), values: v.values }; }
  if (!data || data.length === 0) return { error: NOT_FOUND, values: v.values };
  await audit(ctx, "scholarship.update", id, { fields: Object.keys(v.data) });
  refresh(id);
  return { success: "Scholarship saved.", values: v.values };
}

export async function changeScholarshipStatus(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };
  const id = recordId(formData);
  const toRaw = formData.get("to");
  if (!id || !isStatus(toRaw)) return { error: BAD_ID };
  const to: ScholarshipStatus = toRaw;

  const { data: cur, error: ce } = await ctx.supabase.from("scholarships").select("status").eq("id", id).maybeSingle();
  if (ce) { logDb("status:read", ce); return { error: GENERIC }; }
  if (!cur) return { error: NOT_FOUND };
  const from = (cur as { status: unknown }).status;
  if (!isStatus(from) || !canTransition(from, to)) return { error: "That status change is not allowed." };

  if (to === "active") {
    // Publish gate: official source + admin verification are required (import never satisfies this).
    const { data: sch, error: se } = await ctx.supabase.from("scholarships")
      .select("name,provider,country_id,degree_level,funding_type,official_information_url,official_application_url,last_verified_at").eq("id", id).maybeSingle();
    const { data: srcs, error: sre } = await ctx.supabase.from("scholarship_sources").select("source_url,active,last_verified_at").eq("scholarship_id", id);
    if (se || sre) { logDb("status:readiness", (se ?? sre)!); return { error: GENERIC }; }
    if (!sch) return { error: NOT_FOUND };
    const blockers = publishBlockers(sch as Parameters<typeof publishBlockers>[0], (srcs ?? []) as Parameters<typeof publishBlockers>[1]);
    if (blockers.length) return { error: `Cannot publish yet. ${blockers.join(" ")}` };
  }

  // Conditional on the status we read, so two admins cannot race each other into an unexpected state.
  const { data, error } = await ctx.supabase.from("scholarships").update({ status: to }).eq("id", id).eq("status", from).select("id");
  if (error) { logDb("status", error); return { error: friendly(error) }; }
  if (!data || data.length === 0) return { error: "The scholarship changed while you were editing. Reload and try again." };
  await audit(ctx, "scholarship.status", id, { from, to });
  refresh(id);
  return { success: to === "active" ? "Published. This scholarship is now publicly visible." : to === "archived" ? "Archived. It is no longer public." : "Moved back to draft. It is no longer public." };
}

export async function markScholarshipVerified(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };
  const id = recordId(formData);
  if (!id) return { error: BAD_ID };
  const { data, error } = await ctx.supabase.from("scholarships").update({ last_verified_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) { logDb("verify", error); return { error: friendly(error) }; }
  if (!data || data.length === 0) return { error: NOT_FOUND };
  await audit(ctx, "scholarship.verify", id, {});
  refresh(id);
  return { success: "Marked as verified now. Only do this after you actually checked the official source." };
}

export async function deleteScholarship(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };
  const id = recordId(formData);
  if (!id) return { error: BAD_ID };

  const { data: cur, error: ce } = await ctx.supabase.from("scholarships").select("status").eq("id", id).maybeSingle();
  if (ce) { logDb("delete:read", ce); return { error: GENERIC }; }
  if (!cur) return { error: NOT_FOUND };
  if ((cur as { status: unknown }).status === "active") return { error: "Archive or unpublish this scholarship before deleting it." };

  const { count, error: ae } = await ctx.supabase.from("applications").select("id", { count: "exact", head: true }).eq("scholarship_id", id);
  if (ae) { logDb("delete:applications", ae); return { error: GENERIC }; }
  if ((count ?? 0) > 0) return { error: "This scholarship has applications and cannot be deleted. Archive it instead." };

  const { data, error } = await ctx.supabase.from("scholarships").delete().eq("id", id).select("id");
  if (error) {
    logDb("delete", error);
    return { error: error.code === "23503" ? "This scholarship has applications and cannot be deleted. Archive it instead." : friendly(error) };
  }
  if (!data || data.length === 0) return { error: NOT_FOUND };
  await audit(ctx, "scholarship.delete", id, {});
  refresh(id);
  redirect("/admin/scholarships?deleted=1");
}

// ---------------------------------------------------------------------------------------------
// Sources (scholarship_sources)
export async function saveSource(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };
  const scholarshipId = recordId(formData, "scholarship_id");
  if (!scholarshipId) return { error: BAD_ID };
  const sourceIdRaw = formData.get("id");
  const sourceId = typeof sourceIdRaw === "string" && sourceIdRaw !== "" ? (isUuid(sourceIdRaw) ? sourceIdRaw : null) : "";
  if (sourceId === null) return { error: BAD_ID };

  const v = validateSource(formData);
  if (!v.ok) return { error: "Please fix the highlighted fields.", fieldErrors: v.errors, values: v.values };

  if (sourceId === "") {
    const { error } = await ctx.supabase.from("scholarship_sources").insert({ ...v.data, scholarship_id: scholarshipId });
    if (error) { logDb("source:create", error); return { error: friendly(error), values: v.values }; }
    await audit(ctx, "scholarship.source.create", scholarshipId, {});
  } else {
    const { data, error } = await ctx.supabase.from("scholarship_sources").update(v.data).eq("id", sourceId).eq("scholarship_id", scholarshipId).select("id");
    if (error) { logDb("source:update", error); return { error: friendly(error), values: v.values }; }
    if (!data || data.length === 0) return { error: "That source could not be found.", values: v.values };
    await audit(ctx, "scholarship.source.update", scholarshipId, {});
  }
  refresh(scholarshipId);
  return { success: "Source saved." };
}

export async function markSourceVerified(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };
  const scholarshipId = recordId(formData, "scholarship_id");
  const sourceId = recordId(formData);
  if (!scholarshipId || !sourceId) return { error: BAD_ID };
  const { data, error } = await ctx.supabase.from("scholarship_sources")
    .update({ last_verified_at: new Date().toISOString() }).eq("id", sourceId).eq("scholarship_id", scholarshipId).select("id");
  if (error) { logDb("source:verify", error); return { error: friendly(error) }; }
  if (!data || data.length === 0) return { error: "That source could not be found." };
  await audit(ctx, "scholarship.source.verify", scholarshipId, {});
  refresh(scholarshipId);
  return { success: "Source marked as verified now." };
}

export async function deleteSource(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };
  const scholarshipId = recordId(formData, "scholarship_id");
  const sourceId = recordId(formData);
  if (!scholarshipId || !sourceId) return { error: BAD_ID };
  const { data, error } = await ctx.supabase.from("scholarship_sources").delete().eq("id", sourceId).eq("scholarship_id", scholarshipId).select("id");
  if (error) { logDb("source:delete", error); return { error: friendly(error) }; }
  if (!data || data.length === 0) return { error: "That source could not be found." };
  await audit(ctx, "scholarship.source.delete", scholarshipId, {});
  refresh(scholarshipId);
  return { success: "Source deleted." };
}

// ---------------------------------------------------------------------------------------------
// Curated dataset import (JSON, always created as drafts, all-or-nothing)
export async function importScholarships(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  if ("error" in ctx) return { error: ctx.error };

  const jsonRaw = formData.get("json");
  const json = typeof jsonRaw === "string" ? jsonRaw : "";
  const parsed = parseImportJson(json);
  if (!parsed.ok) return { error: parsed.error, values: { json } };

  const countrySlugs = [...new Set(parsed.records.map((r) => r.countrySlug))];
  const uniSlugs = [...new Set(parsed.records.map((r) => r.universitySlug).filter(Boolean))];
  const { data: cs, error: ce } = await ctx.supabase.from("countries").select("id,slug").in("slug", countrySlugs);
  if (ce) { logDb("import:countries", ce); return { error: GENERIC, values: { json } }; }
  const countryBySlug = new Map(((cs ?? []) as { id: string; slug: string }[]).map((c) => [c.slug, c.id]));
  const uniBySlug = new Map<string, { id: string; country_id: string }>();
  if (uniSlugs.length) {
    const { data: us, error: ue } = await ctx.supabase.from("universities").select("id,slug,country_id").in("slug", uniSlugs);
    if (ue) { logDb("import:universities", ue); return { error: GENERIC, values: { json } }; }
    for (const u of (us ?? []) as { id: string; slug: string; country_id: string }[]) uniBySlug.set(u.slug, { id: u.id, country_id: u.country_id });
  }

  const problems: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const validRecords: typeof parsed.records = [];
  const seen = new Set<string>();
  for (const rec of parsed.records) {
    const countryId = countryBySlug.get(rec.countrySlug);
    if (!countryId) { problems.push(`Record ${rec.index}: unknown country_slug "${rec.countrySlug}".`); continue; }
    let universityId = "";
    if (rec.universitySlug) {
      const u = uniBySlug.get(rec.universitySlug);
      if (!u) { problems.push(`Record ${rec.index}: unknown university_slug "${rec.universitySlug}".`); continue; }
      if (u.country_id !== countryId) { problems.push(`Record ${rec.index}: that university is not in the stated country.`); continue; }
      universityId = u.id;
    }
    const v = validateScholarship({ ...rec.fields, country_id: countryId, university_id: universityId });
    if (!v.ok) {
      const [field, msg] = Object.entries(v.errors)[0];
      problems.push(`Record ${rec.index}: ${field} - ${msg}`);
      continue;
    }
    const key = `${v.data.name.toLowerCase()}|${v.data.provider.toLowerCase()}|${v.data.country_id}`;
    if (seen.has(key)) { problems.push(`Record ${rec.index}: duplicate of an earlier record in this import.`); continue; }
    seen.add(key);
    rows.push({ ...v.data, status: "draft" });
    validRecords.push(rec);
  }
  if (problems.length) return { error: `Nothing was imported. ${problems.slice(0, 10).join(" ")}${problems.length > 10 ? ` (+${problems.length - 10} more)` : ""}`, values: { json } };

  // Existing duplicates (same name + provider + country) are rejected, not overwritten.
  // Fetched by country (not by exact name) so the case-insensitive comparison below cannot be bypassed by casing.
  const countryIds = [...new Set(rows.map((r) => r.country_id as string))];
  const { data: existing, error: ee } = await ctx.supabase.from("scholarships").select("name,provider,country_id").in("country_id", countryIds);
  if (ee) { logDb("import:dups", ee); return { error: GENERIC, values: { json } }; }
  const existingKeys = new Set(((existing ?? []) as { name: string; provider: string; country_id: string }[]).map((e) => `${e.name.toLowerCase()}|${e.provider.toLowerCase()}|${e.country_id}`));
  const clashes = rows.filter((r) => existingKeys.has(`${(r.name as string).toLowerCase()}|${(r.provider as string).toLowerCase()}|${r.country_id}`));
  if (clashes.length) return { error: `Nothing was imported. ${clashes.length} record(s) already exist (same name, provider and country).`, values: { json } };

  const { data, error } = await ctx.supabase.from("scholarships").insert(rows).select("id,name,provider,country_id"); // one statement = atomic
  if (error) { logDb("import:insert", error); return { error: friendly(error), values: { json } }; }

  // Sources (never marked verified). PostgREST returns rows in insert order; map back by position.
  const inserted = (data ?? []) as { id: string; name: string; provider: string; country_id: string }[];
  const srcRows: Record<string, unknown>[] = [];
  const idByKey = new Map(inserted.map((r) => [`${r.name.toLowerCase()}|${r.provider.toLowerCase()}|${r.country_id}`, r.id]));
  for (const [i, rec] of validRecords.entries()) {
    const sid = idByKey.get(`${(rows[i].name as string).toLowerCase()}|${(rows[i].provider as string).toLowerCase()}|${rows[i].country_id}`);
    if (sid) for (const s of rec.sources) srcRows.push({ ...s, scholarship_id: sid });
  }
  if (srcRows.length) {
    const { error: sErr } = await ctx.supabase.from("scholarship_sources").insert(srcRows);
    if (sErr) {
      logDb("import:sources", sErr);
      const { error: rb } = await ctx.supabase.from("scholarships").delete().in("id", inserted.map((r) => r.id)); // roll back: all-or-nothing
      if (rb) logDb("import:rollback", rb);
      return { error: rb ? "Import failed partway. Check the drafts list for stray records." : friendly(sErr), values: { json } };
    }
  }
  await audit(ctx, "scholarship.import", null, { count: inserted.length || rows.length, sources: srcRows.length, status: "draft" });
  refresh();
  return { success: `Imported ${inserted.length || rows.length} scholarship(s) as drafts (${srcRows.length} source(s), unverified). Verify each against its official source, then publish explicitly.` };
}
