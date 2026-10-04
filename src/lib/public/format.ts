import type { FundingType } from "./types";

export const NOT_AVAILABLE = "Information not available.";

export const FUNDING_LABELS: Record<FundingType, string> = {
  fully_funded: "Fully funded",
  partially_funded: "Partially funded",
  not_funded: "Admission only / not funded",
};

/** Plain-language meaning of each funding label. Deliberately avoids promising that every cost is covered. */
export const FUNDING_EXPLANATIONS: Record<FundingType, string> = {
  fully_funded:
    "The provider describes this award as fully funded. What that includes (tuition, living costs, travel, insurance) differs by scholarship, so check the funding details on each page and on the official site.",
  partially_funded:
    "The award covers some costs, such as part of the tuition or a limited allowance. You will need to plan for the remaining expenses yourself.",
  not_funded:
    "Admission or eligibility only. No financial award is attached, so tuition and living costs are not covered by this opportunity.",
};

export function isFundingType(value: unknown): value is FundingType {
  return value === "fully_funded" || value === "partially_funded" || value === "not_funded";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isSlug(value: string): boolean {
  return value.length <= 80 && SLUG_RE.test(value);
}

/** Only http(s) URLs may become hrefs (defence in depth; the DB also has CHECK constraints). */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** `YYYY-MM-DD` (Postgres date) or ISO timestamp -> "12 March 2027". Timezone-stable (UTC). */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export type DeadlineState = "none" | "open" | "closed";
export function deadlineState(deadline: string | null): DeadlineState {
  if (!deadline) return "none";
  return deadline < todayIsoDate() ? "closed" : "open";
}

export function formatGpa(min: number | null, scale: number | null): string | null {
  if (min === null) return null;
  return scale === null ? `${min} (scale not specified)` : `${min} out of ${scale}`;
}

export function humanizeKey(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
