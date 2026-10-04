import {
  DESCRIPTION_MAX,
  isReportReason,
  isReportStatus,
  isReportTargetType,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from "./constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function parseReportInput(raw: {
  targetType?: unknown;
  targetId?: unknown;
  reason?: unknown;
  description?: unknown;
}):
  | {
      ok: true;
      targetType: ReportTargetType;
      targetId: string | null;
      reason: ReportReason;
      description: string | null;
    }
  | { ok: false; message: string } {
  if (!isReportTargetType(raw.targetType)) {
    return { ok: false, message: "Invalid report target." };
  }
  if (!isReportReason(raw.reason)) {
    return { ok: false, message: "Invalid reason." };
  }
  const targetId =
    typeof raw.targetId === "string" && isUuid(raw.targetId) ? raw.targetId : null;
  let description: string | null = null;
  if (typeof raw.description === "string" && raw.description.trim()) {
    description = raw.description.trim().slice(0, DESCRIPTION_MAX);
  }
  return { ok: true, targetType: raw.targetType, targetId, reason: raw.reason, description };
}

export function parseReportStatusUpdate(raw: unknown): ReportStatus | null {
  return isReportStatus(raw) ? raw : null;
}
