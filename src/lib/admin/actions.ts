"use server";

import { revalidatePath } from "next/cache";

import { requireRole, requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { logAdminAction } from "./queries";
import type { AdminFormState } from "./types";
import { isUuid, parseReportInput, parseReportStatusUpdate } from "./validation";

function unavailable(): AdminFormState {
  return { error: "Admin tools are temporarily unavailable." };
}

/** Any signed-in user can file a report. */
export async function submitReport(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const { user } = await requireUser();
  if (!isSupabaseConfigured()) return unavailable();
  const parsed = parseReportInput({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
    description: formData.get("description"),
  });
  if (!parsed.ok) return { error: parsed.message };

  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    reporter_user_id: user.id,
    target_type: parsed.targetType,
    target_id: parsed.targetId,
    reason: parsed.reason,
    description: parsed.description,
    status: "open",
  });
  if (error) {
    console.error("[admin:report-submit]", error.code ?? "unknown");
    return { error: "Could not submit report." };
  }
  revalidatePath("/admin/reports");
  return { success: "Report submitted. Thank you." };
}

export async function updateReportStatus(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const { user } = await requireRole(["admin"]);
  if (!isSupabaseConfigured()) return unavailable();
  const reportId = formData.get("reportId");
  if (!isUuid(reportId)) return { error: "Invalid report id." };
  const status = parseReportStatusUpdate(formData.get("status"));
  if (!status) return { error: "Invalid status." };

  const supabase = await createClient();
  const resolved = status === "resolved" || status === "dismissed";
  const { error } = await supabase
    .from("reports")
    .update({
      status,
      resolved_by: resolved ? user.id : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", reportId);
  if (error) {
    console.error("[admin:report-update]", error.code ?? "unknown");
    return { error: "Could not update report." };
  }
  await logAdminAction(supabase, user.id, "report_status", "report", reportId, { status });
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { success: `Report marked ${status}.` };
}
