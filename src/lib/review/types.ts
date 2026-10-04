import type { OverallStatus, ReviewCategory, ReviewSeverity } from "./constants";

/** Single finding from completeness, consistency, or health aggregation. */
export type ReviewItem = {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  title: string;
  detail: string;
};

/** Aggregated final application health (FR-022 + FR-023). */
export type ApplicationHealth = {
  overall: OverallStatus;
  /** Heuristic 0–100; blockers cap the score. Not a ranking of the student. */
  score: number;
  items: ReviewItem[];
  summary: string;
  /** Counts for UI badges. */
  counts: {
    blockers: number;
    warnings: number;
    ok: number;
    info: number;
  };
};

/** Input shapes for the pure review engine (no DB types). */
export type ReviewProfileInput = {
  hasProfile: boolean;
  fullNamePresent: boolean;
  nationalityPresent: boolean;
  educationCount: number;
  experienceCount: number;
  /** Highest recorded CGPA if any (null if none). */
  maxCgpa: number | null;
  maxCgpaScale: number | null;
  /** Degree/level labels from education rows (lowercased words for heuristics). */
  educationLabels: string[];
  fieldLabels: string[];
};

export type ReviewDocumentInput = {
  documentType: string | null;
  fileName: string;
};

export type ReviewDraftInput = {
  draftType: string;
  content: string;
  userApproved: boolean;
  version: number;
};

export type ReviewTaskInput = {
  title: string;
  status: string;
  required: boolean;
  dueDate: string | null;
};

export type ReviewScholarshipInput = {
  name: string;
  deadline: string | null;
  degreeLevel: string;
  field: string | null;
  status: string;
};

export type ReviewEligibilityInput = {
  decision: string; // eligible | possible | not_eligible | needs_information | unknown
  checks: Array<{ id: string; outcome: string; label: string }>;
};

export type ReviewInput = {
  todayIso: string;
  profile: ReviewProfileInput;
  documents: ReviewDocumentInput[];
  drafts: ReviewDraftInput[];
  tasks: ReviewTaskInput[];
  scholarship: ReviewScholarshipInput;
  eligibility: ReviewEligibilityInput | null;
};
