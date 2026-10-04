/**
 * Application Workspace constants (Module 14). Pure and client-safe.
 * Status values are app-enforced (no CHECK on applications.status / application_tasks.status in DDL).
 * Align task statuses with the Module 13 agent (`TaskStatus`).
 */

export const APPLICATION_STATUSES = [
  { value: "planning", label: "Planning" },
  { value: "in_progress", label: "In progress" },
  { value: "submitted", label: "Submitted" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]["value"];

export const TASK_STATUSES = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "skipped", label: "Skipped" },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["value"];

export const NOTES_MAX = 4_000;
export const TASK_TITLE_MAX = 140;
export const TASK_DESCRIPTION_MAX = 600;

export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return typeof v === "string" && (APPLICATION_STATUSES as readonly { value: string }[]).some((s) => s.value === v);
}

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly { value: string }[]).some((s) => s.value === v);
}

export function applicationStatusLabel(status: string): string {
  return APPLICATION_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function taskStatusLabel(status: string): string {
  return TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
}
