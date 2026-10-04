import { EDUCATION_LEVELS, EXPERIENCE_TYPES } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2022-09-01" -> "Sep 2022" (no timezone shifts: parsed from the string, not a Date). */
export function formatMonth(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-\d{2}$/.exec(iso) : null;
  if (!m) return null;
  return `${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}

export function dateRange(start: string | null, end: string | null, endFallback: string): string | null {
  const s = formatMonth(start);
  const e = formatMonth(end);
  if (!s && !e) return null;
  return `${s ?? "?"} – ${e ?? endFallback}`;
}

export function levelLabel(v: string | null): string | null {
  return v ? (EDUCATION_LEVELS.find((l) => l.value === v)?.label ?? v) : null;
}

export function experienceTypeLabel(v: string | null): string | null {
  return v ? (EXPERIENCE_TYPES.find((t) => t.value === v)?.label ?? v) : null;
}

export function formatGpa(cgpa: number | null, scale: number | null): string | null {
  if (cgpa === null) return null;
  return scale === null ? String(cgpa) : `${cgpa} / ${scale}`;
}
