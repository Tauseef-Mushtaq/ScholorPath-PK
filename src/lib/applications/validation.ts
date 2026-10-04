/**
 * Pure validation for Application Workspace (Module 14). No I/O.
 * Only allow-listed fields; ownership keys are never read from the client.
 */

import {
  APPLICATION_STATUSES,
  isApplicationStatus,
  isTaskStatus,
  NOTES_MAX,
  TASK_DESCRIPTION_MAX,
  TASK_TITLE_MAX,
  type ApplicationStatus,
  type TaskStatus,
} from "./constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(CTRL, " ").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function parseApplicationStatus(v: unknown): ApplicationStatus | null {
  return isApplicationStatus(v) ? v : null;
}

export function parseTaskStatus(v: unknown): TaskStatus | null {
  return isTaskStatus(v) ? v : null;
}

/** Notes: empty string clears; overlong rejected. */
export function parseNotes(v: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, message: "Notes must be text." };
  const t = v.replace(CTRL, " ").replace(/\r\n/g, "\n").trim();
  if (t.length > NOTES_MAX) return { ok: false, message: `Notes must be at most ${NOTES_MAX} characters.` };
  return { ok: true, value: t.length ? t : null };
}

export function parseTaskTitle(v: unknown): string | null {
  const t = cleanText(v, TASK_TITLE_MAX);
  return t && t.length >= 3 ? t : null;
}

export function parseTaskDescription(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return cleanText(v, TASK_DESCRIPTION_MAX);
}

export function parseOptionalDate(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** Status transitions that set submitted_at / started_at on the server (never from client timestamps). */
export function statusSideEffects(
  next: ApplicationStatus,
  prev: ApplicationStatus,
): { startedAt?: true; submittedAt?: true; clearSubmittedAt?: true } {
  const out: { startedAt?: true; submittedAt?: true; clearSubmittedAt?: true } = {};
  if (next === "in_progress" && prev === "planning") out.startedAt = true;
  if (next === "submitted" && prev !== "submitted") out.submittedAt = true;
  if (prev === "submitted" && next !== "submitted" && next !== "accepted" && next !== "rejected") {
    out.clearSubmittedAt = true;
  }
  return out;
}

export const STATUS_VALUES = APPLICATION_STATUSES.map((s) => s.value);
