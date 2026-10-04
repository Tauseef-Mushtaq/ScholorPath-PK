/**
 * Module 09 — eligibility + matching types.
 *
 * These are deliberately decoupled from database rows and from the UI so the engine can be unit-tested
 * with plain objects. Nothing in `src/lib/matching` except `queries.ts` touches Supabase.
 */

export type FundingType = "fully_funded" | "partially_funded" | "not_funded";

/** One education record as the engine needs it (already normalised to numbers / ISO dates / nulls). */
export type MatchEducation = {
  level: string | null;
  field: string | null;
  cgpa: number | null;
  cgpaScale: number | null;
  startDate: string | null;
  expectedGraduation: string | null;
};

/** The signed-in student's data used for matching. Never contains another user's data. */
export type MatchProfile = {
  nationality: string | null; // carried for display only; NOT evaluated (no scholarship column to compare with)
  education: MatchEducation[];
};

export type MatchRequirement = {
  id: string;
  requirementType: string;
  title: string;
  description: string | null;
  required: boolean;
};

/** A scholarship as returned by the public (anon, RLS-filtered) read layer. */
export type MatchScholarship = {
  id: string;
  name: string;
  provider: string;
  status: string; // only "active" is ever matched
  degreeLevel: string;
  field: string | null;
  fundingType: FundingType;
  deadline: string | null;
  country: { name: string; slug: string } | null;
  university: { name: string } | null;
  minimumGpa: number | null;
  minimumGpaScale: number | null;
  englishRequirementSummary: string | null;
  eligibilitySummary: string | null;
  requirements: MatchRequirement[];
};

export type EligibilityStatus =
  | "likely_eligible"
  | "possibly_eligible"
  | "not_eligible"
  | "insufficient_information";

/**
 * The student-facing outcome (Repair Session 3). Four distinct answers, never blended:
 *  - eligible          every criterion we can check is met and nothing relevant is unresolved
 *  - not_eligible      a clearly stated mandatory criterion contradicts the recorded profile
 *  - needs_information the answer depends on something MISSING FROM THE STUDENT'S PROFILE
 *  - unknown           the answer cannot be decided from the data we hold (scholarship text we cannot
 *                      compare, written requirements, ambiguous rules) even with a complete profile
 * Missing information is never `eligible`.
 */
export type MatchDecision = "eligible" | "not_eligible" | "needs_information" | "unknown";

export type CheckOutcome = "met" | "not_met" | "unknown" | "not_applicable" | "info";

export type CheckKey = "degree_level" | "field" | "gpa" | "requirement" | "english" | "eligibility_summary";

export type ProfileSection = "education" | "personal";

export type Check = {
  key: CheckKey;
  label: string;
  outcome: CheckOutcome;
  /** Mandatory checks decide eligibility. Non-mandatory checks only inform relevance / explanation. */
  mandatory: boolean;
  /** Plain-language explanation shown to the student. */
  detail: string;
  /** When outcome is "unknown" because the PROFILE lacks something, where the student can add it. */
  missing?: { section: ProfileSection; what: string };
};

export type Availability = "open" | "closed" | "unknown";

export type MatchResult = {
  scholarship: MatchScholarship;
  status: EligibilityStatus;
  /** Student-facing four-way outcome; derived from the same checks as `status`. */
  decision: MatchDecision;
  checks: Check[];
  /** Number of checks that were positively met (a plain count, NOT a probability). */
  metCount: number;
  /** Number of checks that could be evaluated against the profile (met or not met). */
  evaluatedCount: number;
  /** False when the degree level is clearly different or the field is clearly different. */
  relevant: boolean;
  availability: Availability;
};

export type MatchOptions = {
  /** Include scholarships whose deadline has passed (they are shown last and labelled Closed). */
  includeClosed: boolean;
  /** Include scholarships that are not relevant (different level / field) and clearly not eligible ones. */
  showAll: boolean;
};

export type MatchSummary = {
  results: MatchResult[]; // sorted, filtered per options
  counts: {
    candidates: number;
    shown: number;
    hiddenNotRelevant: number;
    hiddenClosed: number;
    excludedNotPublic: number;
    byStatus: Record<EligibilityStatus, number>;
    byDecision: Record<MatchDecision, number>;
  };
};
