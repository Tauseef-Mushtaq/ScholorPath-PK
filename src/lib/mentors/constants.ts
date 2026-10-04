/**
 * Mentor Community constants (Module 17). Pure and client-safe.
 */

export const VERIFICATION_STATUSES = [
  { value: "pending", label: "Pending review" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]["value"];

export const STORY_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

export type StoryStatus = (typeof STORY_STATUSES)[number]["value"];

export const QUESTION_STATUSES = [
  { value: "open", label: "Open" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number]["value"];

export const ANSWER_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

export type AnswerStatus = (typeof ANSWER_STATUSES)[number]["value"];

export const STORY_TITLE_MAX = 200;
export const STORY_BODY_MAX = 50_000;
export const TIMELINE_TITLE_MAX = 200;
export const TIMELINE_PERIOD_MAX = 100;
export const TIMELINE_DESC_MAX = 4_000;
export const QUESTION_TITLE_MAX = 200;
export const QUESTION_BODY_MAX = 4_000;
export const ANSWER_MAX = 20_000;
export const FIELD_MAX = 200;
export const DEGREE_LEVEL_MAX = 100;

export const PERSONAL_EXPERIENCE_LABEL =
  "Personal experience — not an official scholarship requirement.";

export function isVerificationStatus(v: unknown): v is VerificationStatus {
  return typeof v === "string" && (VERIFICATION_STATUSES as readonly { value: string }[]).some((s) => s.value === v);
}

export function isStoryStatus(v: unknown): v is StoryStatus {
  return typeof v === "string" && (STORY_STATUSES as readonly { value: string }[]).some((s) => s.value === v);
}

export function isQuestionStatus(v: unknown): v is QuestionStatus {
  return typeof v === "string" && (QUESTION_STATUSES as readonly { value: string }[]).some((s) => s.value === v);
}

export function isAnswerStatus(v: unknown): v is AnswerStatus {
  return typeof v === "string" && (ANSWER_STATUSES as readonly { value: string }[]).some((s) => s.value === v);
}

export function verificationLabel(status: string): string {
  return VERIFICATION_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function storyStatusLabel(status: string): string {
  return STORY_STATUSES.find((s) => s.value === status)?.label ?? status;
}
