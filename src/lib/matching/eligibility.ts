/**
 * Deterministic eligibility evaluation (Module 09). PURE: no I/O, no clock (the caller passes `todayIso`),
 * no AI. Each rule returns a transparent `Check`; the overall status is derived from the checks only.
 *
 * Rules (also documented in docs/DECISIONS.md ADR-031):
 *  1. Degree level  — mandatory.  Compares the scholarship's level with the student's education records.
 *  2. Field         — free text, compared by shared words only. It can NEVER make anyone "not eligible" (a word
 *                     mismatch is not proof), but a restricted field that is unknown or has no overlap also prevents
 *                     "eligible": the student must confirm it. Missing information is never eligible.
 *  3. Minimum GPA   — mandatory when the scholarship states one. Proportional conversion between scales.
 *  4. Requirement rows (`scholarship_requirements`) — free text, cannot be evaluated: "unknown" (mandatory
 *     only if the row is marked required).
 *  5. English / eligibility summaries — shown for information only; they never change the status.
 *  Nationality is NOT evaluated: the schema has no scholarship-side nationality data to compare with.
 *
 * Missing student data is always "unknown", never "not met". Only a clearly defined mandatory rule that the
 * recorded data contradicts yields "not_eligible".
 */

import {
  completionState,
  formatRatioPercent,
  fieldsOverlap,
  gpaRatio,
  isLevelKey,
  isoDateOrNull,
  isUnrestrictedField,
  LEVEL_LABEL,
  LEVEL_RANK,
  parseScholarshipLevels,
  type LevelKey,
} from "./normalize";
import type {
  Availability,
  Check,
  CheckOutcome,
  EligibilityStatus,
  MatchDecision,
  MatchEducation,
  MatchProfile,
  MatchResult,
  MatchScholarship,
} from "./types";

const MAX_REQUIREMENT_ROWS = 20;
const MAX_TEXT = 240;
const GPA_SCALE_TOLERANCE = 0.05; // when scales differ, a shortfall smaller than 5 points is "unknown", not "not met"

function clip(text: string, max = MAX_TEXT): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

type StudentRecord = {
  level: LevelKey;
  rank: number;
  field: string | null;
  ratio: number | null;
  cgpa: number | null;
  scale: number | null;
  startDate: string | null;
  expectedGraduation: string | null;
};

/** Keeps only records with a recognised level (the profile's "Other" level is not comparable). */
function usableRecords(education: readonly MatchEducation[] | null | undefined): StudentRecord[] {
  const out: StudentRecord[] = [];
  const list: readonly MatchEducation[] = Array.isArray(education) ? education : [];
  for (const e of list) {
    if (!e || !isLevelKey(e.level)) continue;
    const level: LevelKey = e.level;
    const field = typeof e.field === "string" && e.field.trim() ? e.field.trim() : null;
    out.push({
      level,
      rank: LEVEL_RANK[level],
      field,
      ratio: gpaRatio(e.cgpa, e.cgpaScale),
      cgpa: typeof e.cgpa === "number" && Number.isFinite(e.cgpa) ? e.cgpa : null,
      scale: typeof e.cgpaScale === "number" && Number.isFinite(e.cgpaScale) ? e.cgpaScale : null,
      startDate: isoDateOrNull(e.startDate),
      expectedGraduation: isoDateOrNull(e.expectedGraduation),
    });
  }
  return out;
}

const OUTCOME_ORDER: Record<CheckOutcome, number> = { met: 3, unknown: 2, not_applicable: 1, info: 1, not_met: 0 };

// ------------------------------------------------------------------------------------------
// 1. Degree level
// ------------------------------------------------------------------------------------------

function evaluateOneLevel(t: LevelKey, records: StudentRecord[], todayIso: string): { outcome: CheckOutcome; detail: string; missing?: Check["missing"] } {
  const target = LEVEL_RANK[t];
  const highest = Math.max(...records.map((r) => r.rank));
  const highestKey = (Object.keys(LEVEL_RANK) as LevelKey[]).find((k) => LEVEL_RANK[k] === highest) as LevelKey;

  if (highest >= target) {
    return {
      outcome: "not_met",
      detail: `This scholarship is for ${LEVEL_LABEL[t]} applicants, but your profile already lists a ${LEVEL_LABEL[highestKey]} record (same level or higher). Check your education records if this is not right.`,
    };
  }

  const prereq = target - 1; // bachelor <- intermediate, master <- bachelor, phd <- master
  const prereqKey = (Object.keys(LEVEL_RANK) as LevelKey[]).find((k) => LEVEL_RANK[k] === prereq) as LevelKey;

  if (highest === prereq) {
    const atPrereq = records.filter((r) => r.rank === prereq);
    const states = atPrereq.map((r) => completionState(r.expectedGraduation, todayIso));
    if (states.includes("completed")) {
      return { outcome: "met", detail: `You have completed a ${LEVEL_LABEL[prereqKey]} record, the usual step before a ${LEVEL_LABEL[t]}.` };
    }
    if (states.includes("in_progress")) {
      return {
        outcome: "unknown",
        detail: `You are still studying for your ${LEVEL_LABEL[prereqKey]}. Some scholarships accept final-year students and others require the degree to be completed; check the official rules.`,
      };
    }
    return {
      outcome: "unknown",
      detail: `Your ${LEVEL_LABEL[prereqKey]} has no graduation date, so we cannot tell whether it is completed.`,
      missing: { section: "education", what: `Graduation date for your ${LEVEL_LABEL[prereqKey]}` },
    };
  }

  if (t === "phd" && highest === LEVEL_RANK.bachelor) {
    return {
      outcome: "unknown",
      detail: "A PhD usually follows a Master's degree, but some programmes accept a Bachelor's degree. Check the official requirements.",
    };
  }

  return {
    outcome: "not_met",
    detail: `A ${LEVEL_LABEL[t]} scholarship normally requires a ${LEVEL_LABEL[prereqKey]} first, and the highest level in your profile is ${LEVEL_LABEL[highestKey]}. If you have a higher qualification, add it to your education records.`,
  };
}

function degreeLevelCheck(records: StudentRecord[], s: MatchScholarship, todayIso: string): Check {
  const label = "Degree level";
  const parsed = parseScholarshipLevels(s.degreeLevel);
  const base = { key: "degree_level" as const, label, mandatory: true };

  if (parsed.kind === "any") return { ...base, mandatory: false, outcome: "not_applicable", detail: "The scholarship does not restrict the degree level." };
  if (parsed.kind === "unrecognized") {
    return { ...base, outcome: "unknown", detail: `The scholarship's level ("${clip(String(s.degreeLevel ?? ""), 60)}") could not be compared with your education automatically. Check the official requirements.` };
  }
  if (records.length === 0) {
    return {
      ...base,
      outcome: "unknown",
      detail: "Add your education history so we can compare your level with this scholarship.",
      missing: { section: "education", what: "At least one education record with a level" },
    };
  }
  // Several target levels (e.g. "Master's and PhD"): the most favourable one decides.
  let best: ReturnType<typeof evaluateOneLevel> | null = null;
  for (const t of parsed.levels) {
    const r = evaluateOneLevel(t, records, todayIso);
    if (!best || OUTCOME_ORDER[r.outcome] > OUTCOME_ORDER[best.outcome]) best = r;
  }
  return { ...base, ...(best as NonNullable<typeof best>) };
}

// ------------------------------------------------------------------------------------------
// 2. Field (relevance only)
// ------------------------------------------------------------------------------------------

function fieldCheck(records: StudentRecord[], s: MatchScholarship): Check {
  const base = { key: "field" as const, label: "Field of study", mandatory: true };
  if (isUnrestrictedField(s.field)) {
    return { ...base, mandatory: false, outcome: "not_applicable", detail: "The scholarship does not name a specific field." };
  }
  if (records.length === 0) {
    return { ...base, outcome: "unknown", detail: `The scholarship is for "${clip(String(s.field), 80)}". Add your education to compare fields.`, missing: { section: "education", what: "Field of study" } };
  }
  // The latest (highest-level) education is the best indicator of the student's current area.
  const highest = Math.max(...records.map((r) => r.rank));
  const fields = records.filter((r) => r.rank === highest && r.field).map((r) => r.field as string);
  if (fields.length === 0) {
    return {
      ...base,
      outcome: "unknown",
      detail: `The scholarship is for "${clip(String(s.field), 80)}", but your latest education has no field of study.`,
      missing: { section: "education", what: "Field of study for your latest education" },
    };
  }
  if (fieldsOverlap(String(s.field), fields)) {
    return { ...base, outcome: "met", detail: `Your field (${clip(fields.join(", "), 80)}) shares terms with the scholarship's field (${clip(String(s.field), 80)}).` };
  }
  return {
    ...base,
    outcome: "not_met",
    detail: `The scholarship's field (${clip(String(s.field), 80)}) does not obviously relate to your field (${clip(fields.join(", "), 80)}). Fields are compared as text, so check the official requirements if you think it still fits.`,
  };
}

// ------------------------------------------------------------------------------------------
// 3. Minimum GPA
// ------------------------------------------------------------------------------------------

function pickGpaRecord(records: StudentRecord[], targetRank: number | null): StudentRecord | null {
  const withRatio = records.filter((r) => r.ratio !== null);
  if (withRatio.length === 0) return null;
  const pool = targetRank === null ? [] : withRatio.filter((r) => r.rank < targetRank);
  const candidates = pool.length ? pool : withRatio;
  return candidates.reduce((best, r) => {
    if (r.rank !== best.rank) return r.rank > best.rank ? r : best;
    return (r.startDate ?? "") > (best.startDate ?? "") ? r : best;
  });
}

function gpaCheck(records: StudentRecord[], s: MatchScholarship): Check {
  const base = { key: "gpa" as const, label: "Minimum GPA", mandatory: true };
  const min = s.minimumGpa;
  if (min === null || min === undefined) return { ...base, mandatory: false, outcome: "not_applicable", detail: "No minimum GPA is listed for this scholarship." };

  const required = gpaRatio(min, s.minimumGpaScale);
  if (required === null) {
    return { ...base, outcome: "unknown", detail: "The scholarship lists a minimum GPA without a usable scale, so it cannot be compared with your CGPA. Check the official requirements." };
  }

  const parsed = parseScholarshipLevels(s.degreeLevel);
  const targetRank = parsed.kind === "levels" ? Math.min(...parsed.levels.map((l) => LEVEL_RANK[l])) : null;
  const rec = pickGpaRecord(records, targetRank);
  if (!rec || rec.ratio === null) {
    return {
      ...base,
      outcome: "unknown",
      detail: `The scholarship asks for a GPA of ${min} out of ${s.minimumGpaScale}. Add a CGPA and its scale to your education to check this.`,
      missing: { section: "education", what: "CGPA and CGPA scale" },
    };
  }

  const sameScale = rec.scale !== null && s.minimumGpaScale !== null && Math.abs(rec.scale - s.minimumGpaScale) < 1e-9;
  const yours = `${rec.cgpa}/${rec.scale} (${formatRatioPercent(rec.ratio)})`;
  const needs = `${min}/${s.minimumGpaScale} (${formatRatioPercent(required)})`;
  const approx = sameScale ? "" : " Scales are converted proportionally, which is only an approximation.";

  if (rec.ratio + 1e-9 >= required) {
    return { ...base, outcome: "met", detail: `Your ${LEVEL_LABEL[rec.level]} CGPA ${yours} reaches the minimum ${needs}.${approx}` };
  }
  const shortfall = required - rec.ratio;
  if (!sameScale && shortfall < GPA_SCALE_TOLERANCE) {
    return { ...base, outcome: "unknown", detail: `Your ${LEVEL_LABEL[rec.level]} CGPA ${yours} is close to the minimum ${needs}, but the scales differ, so we cannot be sure. Confirm how the provider converts grades.` };
  }
  return { ...base, outcome: "not_met", detail: `Your ${LEVEL_LABEL[rec.level]} CGPA ${yours} is below the minimum ${needs}.${approx}` };
}

// ------------------------------------------------------------------------------------------
// 4/5. Requirement rows + informational summaries
// ------------------------------------------------------------------------------------------

// Module 10 / ADR-032: rows of this type are process guidance for applicants in Pakistan, not
// eligibility conditions, so they never become a check (and never change the status). Keep the
// literal in sync with PAKISTAN_SIDE_TYPE in src/lib/public/detail.ts.
const PAKISTAN_SIDE_TYPE = "pakistan_side";
function isPakistanSideRow(r: unknown): boolean {
  const t = r && typeof r === "object" ? (r as { requirementType?: unknown }).requirementType : null;
  return typeof t === "string" && t.trim().toLowerCase().replace(/[\s-]+/g, "_") === PAKISTAN_SIDE_TYPE;
}

function requirementChecks(s: MatchScholarship): Check[] {
  const rows = Array.isArray(s.requirements)
    ? s.requirements.filter((r) => !isPakistanSideRow(r)).slice(0, MAX_REQUIREMENT_ROWS)
    : [];
  const out: Check[] = [];
  for (const r of rows) {
    if (!r || typeof r.title !== "string" || !r.title.trim()) continue;
    const required = r.required !== false;
    out.push({
      key: "requirement",
      label: clip(r.title, 120),
      outcome: "unknown",
      mandatory: required,
      detail: `${required ? "Required" : "Optional"}: this is written as text and cannot be checked automatically.${r.description ? ` ${clip(r.description, 160)}` : ""} Read the official requirement and confirm it yourself.`,
    });
  }
  return out;
}

function infoChecks(s: MatchScholarship): Check[] {
  const out: Check[] = [];
  if (typeof s.englishRequirementSummary === "string" && s.englishRequirementSummary.trim()) {
    out.push({ key: "english", label: "English requirement", outcome: "info", mandatory: false, detail: `Not checked (your profile has no language test data): ${clip(s.englishRequirementSummary)}` });
  }
  if (typeof s.eligibilitySummary === "string" && s.eligibilitySummary.trim()) {
    out.push({ key: "eligibility_summary", label: "Provider's eligibility summary", outcome: "info", mandatory: false, detail: `Not checked automatically: ${clip(s.eligibilitySummary)}` });
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// Status + availability
// ------------------------------------------------------------------------------------------

/**
 * A check that stops the result from being "eligible" without being a proven mismatch:
 * an unknown mandatory check, or a restricted field that is unknown / has no word overlap
 * (free text cannot prove a field mismatch, so it is never "not eligible", but never "eligible" either).
 */
function isUnresolved(c: Check): boolean {
  if (c.key === "field") return c.mandatory && (c.outcome === "unknown" || c.outcome === "not_met");
  return c.mandatory && c.outcome === "unknown";
}

export function deriveStatus(checks: readonly Check[]): EligibilityStatus {
  // A field word-mismatch never decides "not eligible" (see isUnresolved).
  if (checks.some((c) => c.key !== "field" && c.mandatory && c.outcome === "not_met")) return "not_eligible";
  const met = checks.filter((c) => c.outcome === "met").length;
  if (checks.some(isUnresolved)) return met > 0 ? "possibly_eligible" : "insufficient_information";
  return met > 0 ? "likely_eligible" : "insufficient_information";
}

/**
 * Four-way student-facing outcome. Consistent with `deriveStatus`:
 * not_eligible <=> not_eligible; eligible <=> likely_eligible; everything else is split into
 * needs_information (the student can fix it in the profile) vs unknown (they cannot).
 */
export function deriveDecision(checks: readonly Check[], status: EligibilityStatus = deriveStatus(checks)): MatchDecision {
  if (status === "not_eligible") return "not_eligible";
  if (status === "likely_eligible") return "eligible";
  return checks.some((c) => isUnresolved(c) && c.missing) ? "needs_information" : "unknown";
}

export function availabilityOf(deadline: string | null | undefined, todayIso: string): Availability {
  const d = isoDateOrNull(deadline);
  if (!d) return "unknown";
  return d < todayIso ? "closed" : "open"; // same rule as deadlineState() in src/lib/public/format.ts
}

/** Evaluates ONE scholarship for ONE student. Never throws for malformed input. */
export function evaluateScholarship(profile: MatchProfile, scholarship: MatchScholarship, todayIso: string): MatchResult {
  const records = usableRecords(profile?.education);
  const checks: Check[] = [
    degreeLevelCheck(records, scholarship, todayIso),
    gpaCheck(records, scholarship),
    fieldCheck(records, scholarship),
    ...requirementChecks(scholarship),
    ...infoChecks(scholarship),
  ];
  const degree = checks[0];
  const field = checks.find((c) => c.key === "field");
  const status = deriveStatus(checks);
  return {
    scholarship,
    status,
    decision: deriveDecision(checks, status),
    checks,
    metCount: checks.filter((c) => c.outcome === "met").length,
    evaluatedCount: checks.filter((c) => c.outcome === "met" || c.outcome === "not_met").length,
    relevant: degree.outcome !== "not_met" && field?.outcome !== "not_met",
    availability: availabilityOf(scholarship.deadline, todayIso),
  };
}
