/**
 * Application Review constants (Module 16). Pure and client-safe.
 * Categories and severities for the final application health check.
 */

export const REVIEW_CATEGORIES = [
  { value: "eligibility", label: "Eligibility" },
  { value: "profile", label: "Profile" },
  { value: "documents", label: "Documents" },
  { value: "writing", label: "Writing" },
  { value: "tasks", label: "Tasks" },
  { value: "deadline", label: "Deadline" },
  { value: "consistency", label: "Consistency" },
] as const;

export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number]["value"];

export const REVIEW_SEVERITIES = ["ok", "info", "warn", "blocker"] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const OVERALL_STATUSES = ["ready", "needs_work", "not_ready"] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

/** Draft types that count as core written materials for readiness. */
export const CORE_WRITING_TYPES = [
  "sop",
  "motivation_letter",
  "personal_statement",
  "research_proposal",
] as const;

/** Document types commonly required for scholarship applications (metadata only). */
export const EXPECTED_DOCUMENT_TYPES = [
  { value: "passport", label: "Passport / ID", required: true },
  { value: "transcript", label: "Transcript", required: true },
  { value: "degree_certificate", label: "Degree certificate", required: false },
  { value: "cv", label: "CV / Résumé", required: true },
  { value: "english_test", label: "English test result", required: false },
  { value: "recommendation_letter", label: "Recommendation letter", required: false },
] as const;

export function isReviewCategory(v: unknown): v is ReviewCategory {
  return typeof v === "string" && (REVIEW_CATEGORIES as readonly { value: string }[]).some((c) => c.value === v);
}

export function isReviewSeverity(v: unknown): v is ReviewSeverity {
  return typeof v === "string" && (REVIEW_SEVERITIES as readonly string[]).includes(v);
}

export function isOverallStatus(v: unknown): v is OverallStatus {
  return typeof v === "string" && (OVERALL_STATUSES as readonly string[]).includes(v);
}

export function categoryLabel(value: string): string {
  return REVIEW_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
