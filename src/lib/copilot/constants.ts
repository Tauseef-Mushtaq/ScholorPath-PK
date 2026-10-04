/**
 * Application Copilot constants (Module 15). Pure and client-safe.
 * draft_type values match the CHECK constraint on application_drafts.
 */

export const DRAFT_TYPES = [
  { value: "sop", label: "Statement of Purpose (SOP)" },
  { value: "motivation_letter", label: "Motivation letter" },
  { value: "personal_statement", label: "Personal statement" },
  { value: "study_plan", label: "Study plan" },
  { value: "scholarship_essay", label: "Scholarship essay" },
  { value: "research_proposal", label: "Research proposal" },
  { value: "cv", label: "CV / résumé summary" },
  { value: "application_question", label: "Application question answer" },
] as const;

export type DraftType = (typeof DRAFT_TYPES)[number]["value"];

export const CONTENT_MAX = 50_000;
export const TITLE_MAX = 200;
export const PROMPT_SUMMARY_MAX = 500;
export const QUESTION_MAX = 2_000;
export const EXTRA_INSTRUCTIONS_MAX = 1_000;

export function isDraftType(v: unknown): v is DraftType {
  return typeof v === "string" && (DRAFT_TYPES as readonly { value: string }[]).some((d) => d.value === v);
}

export function draftTypeLabel(type: string): string {
  return DRAFT_TYPES.find((d) => d.value === type)?.label ?? type;
}
