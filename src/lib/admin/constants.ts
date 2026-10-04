/**
 * Admin / moderation constants (Module 18). Pure and client-safe.
 */

export const REPORT_TARGET_TYPES = [
  { value: "mentor_story", label: "Mentor story" },
  { value: "mentor_answer", label: "Mentor answer" },
  { value: "mentor_question", label: "Mentor question" },
  { value: "mentor", label: "Mentor profile" },
  { value: "scholarship", label: "Scholarship" },
  { value: "user", label: "User" },
  { value: "other", label: "Other" },
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number]["value"];

export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "misinformation", label: "Misinformation" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REPORT_STATUSES = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number]["value"];

export const DESCRIPTION_MAX = 2000;

export function isReportTargetType(v: unknown): v is ReportTargetType {
  return typeof v === "string" && (REPORT_TARGET_TYPES as readonly { value: string }[]).some((t) => t.value === v);
}

export function isReportReason(v: unknown): v is ReportReason {
  return typeof v === "string" && (REPORT_REASONS as readonly { value: string }[]).some((r) => r.value === v);
}

export function isReportStatus(v: unknown): v is ReportStatus {
  return typeof v === "string" && (REPORT_STATUSES as readonly { value: string }[]).some((s) => s.value === v);
}

export function reportStatusLabel(s: string): string {
  return REPORT_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export function reportReasonLabel(s: string): string {
  return REPORT_REASONS.find((x) => x.value === s)?.label ?? s;
}

export function reportTargetLabel(s: string): string {
  return REPORT_TARGET_TYPES.find((x) => x.value === s)?.label ?? s;
}
