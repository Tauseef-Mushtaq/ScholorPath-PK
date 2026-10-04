import { formatDate, humanizeKey, safeExternalUrl, todayIsoDate } from "./format";
import type { ScholarshipDetail, ScholarshipRequirement } from "./types";

/**
 * Pure presentation logic for the scholarship detail page (Module 10). No I/O, no clock access
 * (callers may pass `today`), no AI. Everything shown comes from stored records; nothing is inferred.
 */

// ---------------------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------------------

/**
 * Convention (ADR-032): rows of `scholarship_requirements` whose `requirement_type` is
 * `pakistan_side` hold steps for applicants in Pakistan. The schema has no dedicated table.
 * The matching engine (Module 09) skips these rows; keep the literal in sync with
 * `src/lib/matching/eligibility.ts`.
 */
export const PAKISTAN_SIDE_TYPE = "pakistan_side";

export function normalizeRequirementType(type: string): string {
  return String(type ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isPakistanSide(r: { requirementType: string }): boolean {
  return normalizeRequirementType(r.requirementType) === PAKISTAN_SIDE_TYPE;
}

export type RequirementGroup = { key: string; label: string; items: ScholarshipRequirement[] };

function sortItems(items: ScholarshipRequirement[]): ScholarshipRequirement[] {
  return [...items].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    const byTitle = a.title.localeCompare(b.title);
    return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id);
  });
}

/** Splits Pakistan-side rows from the rest and groups the rest by type, in a deterministic order. */
export function splitRequirements(items: ScholarshipRequirement[]): {
  general: RequirementGroup[];
  pakistan: ScholarshipRequirement[];
} {
  const pakistan: ScholarshipRequirement[] = [];
  const groups = new Map<string, ScholarshipRequirement[]>();
  for (const r of items) {
    if (isPakistanSide(r)) {
      pakistan.push(r);
      continue;
    }
    const key = normalizeRequirementType(r.requirementType) || "other";
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const general = [...groups.entries()]
    .map(([key, list]) => ({ key, label: humanizeKey(key), items: sortItems(list) }))
    .sort((a, b) => {
      if (a.key === "other") return 1;
      if (b.key === "other") return -1;
      return a.label.localeCompare(b.label);
    });
  return { general, pakistan: sortItems(pakistan) };
}

// ---------------------------------------------------------------------------------------
// Verification (how fresh is the information?)
// ---------------------------------------------------------------------------------------

/** Display heuristic only: after this many days we warn that details may have changed. */
export const STALE_AFTER_DAYS = 180;

function toUtcDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : Math.floor(t / 86400000);
}

export type VerificationState = {
  kind: "never" | "recent" | "stale";
  dateText: string | null;
  message: string;
};

/**
 * A missing, unparsable or future "last verified" date is NEVER treated as verified.
 * Even a recent date only says "last verified"; it never says the details are guaranteed correct.
 */
export function verificationState(lastVerifiedAt: string | null, today: string = todayIsoDate()): VerificationState {
  const day = toUtcDay(lastVerifiedAt);
  const now = toUtcDay(today);
  const dateText = formatDate(lastVerifiedAt);
  if (day === null || now === null || day > now || !dateText) {
    return {
      kind: "never",
      dateText: null,
      message:
        "This listing has not been verified against an official source yet. Treat every detail as unconfirmed and check the official website.",
    };
  }
  const age = now - day;
  if (age > STALE_AFTER_DAYS) {
    const months = Math.max(1, Math.floor(age / 30));
    return {
      kind: "stale",
      dateText,
      message: `Last verified on ${dateText} (about ${months} months ago). Details may have changed since then, so confirm them on the official website.`,
    };
  }
  return {
    kind: "recent",
    dateText,
    message: `Last verified on ${dateText}. Details can still change, so confirm them on the official website before you apply.`,
  };
}

// ---------------------------------------------------------------------------------------
// Application window
// ---------------------------------------------------------------------------------------

export type ApplicationPhase = {
  kind: "upcoming" | "open" | "closed" | "unknown";
  label: string;
};

export function applicationPhase(
  openingDate: string | null,
  deadline: string | null,
  today: string = todayIsoDate(),
): ApplicationPhase {
  const now = toUtcDay(today);
  const open = toUtcDay(openingDate);
  const end = toUtcDay(deadline);
  if (now === null) return { kind: "unknown", label: "Deadline not listed" };

  if (end !== null && end < now) return { kind: "closed", label: "Deadline passed" };
  if (open !== null && open > now) {
    return { kind: "upcoming", label: `Opens ${formatDate(openingDate) ?? "later"}` };
  }
  if (end === null) return { kind: "unknown", label: "Deadline not listed" };

  const left = end - now;
  if (left === 0) return { kind: "open", label: "Deadline is today" };
  if (left === 1) return { kind: "open", label: "Deadline tomorrow" };
  if (left <= 60) return { kind: "open", label: `Deadline in ${left} days` };
  return { kind: "open", label: "Applications open" };
}

// ---------------------------------------------------------------------------------------
// Links and sources
// ---------------------------------------------------------------------------------------

export type LinkView = { href: string; host: string };

/** http(s) only; the host is shown next to the link so students see where it leads. */
export function linkView(url: string | null | undefined): LinkView | null {
  const href = safeExternalUrl(url);
  if (!href) return null;
  try {
    const host = new URL(href).hostname.replace(/^www\./i, "");
    return host ? { href, host } : null;
  } catch {
    return null;
  }
}

export type SourceView = {
  id: string;
  name: string;
  typeLabel: string;
  link: LinkView;
  verifiedText: string | null;
};

export type SourcesView = {
  /** Links stored on the scholarship record itself (and the university website). */
  official: { label: string; link: LinkView }[];
  /** Rows from scholarship_sources, exactly as recorded (type shown as stored, never upgraded). */
  recorded: SourceView[];
  byId: Map<string, SourceView>;
};

export function buildSources(
  d: Pick<ScholarshipDetail, "officialApplicationUrl" | "officialInformationUrl" | "university" | "sources">,
): SourcesView {
  const official: SourcesView["official"] = [];
  const info = linkView(d.officialInformationUrl);
  if (info) official.push({ label: "Official information page", link: info });
  const apply = linkView(d.officialApplicationUrl);
  if (apply) official.push({ label: "Official application page", link: apply });
  const uni = linkView(d.university?.website);
  if (uni && d.university) official.push({ label: `${d.university.name} website`, link: uni });

  const recorded: SourceView[] = [];
  const ordered = [...d.sources].sort(
    (a, b) => a.priority - b.priority || (a.sourceName ?? "").localeCompare(b.sourceName ?? "") || a.id.localeCompare(b.id),
  );
  for (const s of ordered) {
    const link = linkView(s.sourceUrl);
    if (!link) continue; // never render an unsafe or malformed URL
    recorded.push({
      id: s.id,
      name: s.sourceName ?? link.host,
      typeLabel: s.sourceType ? humanizeKey(s.sourceType) : "Type not recorded",
      link,
      verifiedText: formatDate(s.lastVerifiedAt),
    });
  }
  return { official, recorded, byId: new Map(recorded.map((s) => [s.id, s])) };
}

/** The visible source a requirement points to, or null (unrecorded, hidden or unsafe source). */
export function sourceFor(r: Pick<ScholarshipRequirement, "sourceId">, byId: Map<string, SourceView>): SourceView | null {
  return r.sourceId ? (byId.get(r.sourceId) ?? null) : null;
}
