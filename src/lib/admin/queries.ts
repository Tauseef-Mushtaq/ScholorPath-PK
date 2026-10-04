import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isReportReason,
  isReportStatus,
  isReportTargetType,
} from "./constants";
import type {
  AdminActionRow,
  AdminProfileRow,
  AdminStats,
  ReportRow,
  SourceSummary,
} from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

async function countEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) return 0;
  return count ?? 0;
}

async function countAll(supabase: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

/** Dashboard counters. Failures become zeros (page still renders). */
export async function loadAdminStats(supabase: SupabaseClient): Promise<AdminStats> {
  const [
    scholarshipsActive,
    scholarshipsDraft,
    mentorsPending,
    mentorsVerified,
    reportsOpen,
    profilesTotal,
    knowledgeDocuments,
  ] = await Promise.all([
    countEq(supabase, "scholarships", "status", "active"),
    countEq(supabase, "scholarships", "status", "draft"),
    countEq(supabase, "mentors", "verification_status", "pending"),
    countEq(supabase, "mentors", "verification_status", "verified"),
    countEq(supabase, "reports", "status", "open"),
    countAll(supabase, "profiles"),
    countAll(supabase, "knowledge_documents"),
  ]);
  return {
    scholarshipsActive,
    scholarshipsDraft,
    mentorsPending,
    mentorsVerified,
    reportsOpen,
    profilesTotal,
    knowledgeDocuments,
  };
}

export async function loadAdminProfiles(
  supabase: SupabaseClient,
  limit = 100,
): Promise<AdminProfileRow[] | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,user_id,role,full_name,nationality,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin:profiles]", error.code ?? "unknown");
    return null;
  }
  return (data ?? []).map((r) => {
    const row = r as Row;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      role: String(row.role ?? "student"),
      fullName: str(row.full_name),
      nationality: str(row.nationality),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
    };
  });
}

function mapReport(r: Row): ReportRow {
  const tt = String(r.target_type ?? "other");
  const reason = String(r.reason ?? "other");
  const status = String(r.status ?? "open");
  return {
    id: String(r.id),
    reporterUserId: String(r.reporter_user_id),
    targetType: isReportTargetType(tt) ? tt : "other",
    targetId: str(r.target_id),
    reason: isReportReason(reason) ? reason : "other",
    description: str(r.description),
    status: isReportStatus(status) ? status : "open",
    resolvedBy: str(r.resolved_by),
    resolvedAt: str(r.resolved_at),
    createdAt: String(r.created_at ?? ""),
  };
}

export async function loadReports(
  supabase: SupabaseClient,
  statusFilter: string | null = "open",
  limit = 50,
): Promise<ReportRow[] | null> {
  let q = supabase
    .from("reports")
    .select(
      "id,reporter_user_id,target_type,target_id,reason,description,status,resolved_by,resolved_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (statusFilter && statusFilter !== "all") {
    q = q.eq("status", statusFilter);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[admin:reports]", error.code ?? "unknown");
    return null;
  }
  return (data ?? []).map((r) => mapReport(r as Row));
}

export async function loadAdminActions(
  supabase: SupabaseClient,
  limit = 50,
): Promise<AdminActionRow[] | null> {
  const { data, error } = await supabase
    .from("admin_actions")
    .select("id,admin_user_id,action_type,target_type,target_id,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin:audit]", error.code ?? "unknown");
    return null;
  }
  return (data ?? []).map((r) => {
    const row = r as Row;
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    return {
      id: String(row.id),
      adminUserId: str(row.admin_user_id),
      actionType: String(row.action_type ?? ""),
      targetType: str(row.target_type),
      targetId: str(row.target_id),
      metadata: meta,
      createdAt: String(row.created_at ?? ""),
    };
  });
}

export async function loadSourceSummaries(
  supabase: SupabaseClient,
  limit = 80,
): Promise<SourceSummary[] | null> {
  const { data, error } = await supabase
    .from("scholarship_sources")
    .select("id,scholarship_id,source_url,last_verified_at,active,scholarships(name)")
    .order("last_verified_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error("[admin:sources]", error.code ?? "unknown");
    return null;
  }
  return (data ?? []).map((row) => {
    const r = row as Row;
    const sch = Array.isArray(r.scholarships)
      ? (r.scholarships[0] as Row | undefined)
      : (r.scholarships as Row | null);
    return {
      id: String(r.id),
      scholarshipId: String(r.scholarship_id),
      scholarshipName: sch ? String(sch.name ?? "") : "",
      url: str(r.source_url),
      verified: Boolean(r.last_verified_at),
      lastCheckedAt: str(r.last_verified_at),
    };
  });
}

export async function loadKnowledgeStatus(supabase: SupabaseClient): Promise<{
  total: number;
  ready: number;
  failed: number;
  pending: number;
} | null> {
  const [total, ready, failed, pending] = await Promise.all([
    countAll(supabase, "knowledge_documents"),
    countEq(supabase, "knowledge_documents", "processing_status", "ready"),
    countEq(supabase, "knowledge_documents", "processing_status", "failed"),
    countEq(supabase, "knowledge_documents", "processing_status", "pending"),
  ]);
  return { total, ready, failed, pending };
}

/** Append-only audit entry. Never throws to callers. */
export async function logAdminAction(
  supabase: SupabaseClient,
  adminUserId: string,
  actionType: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from("admin_actions").insert({
    admin_user_id: adminUserId,
    action_type: actionType.slice(0, 120),
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
  if (error) console.error("[admin:audit-write]", error.code ?? "unknown");
}
