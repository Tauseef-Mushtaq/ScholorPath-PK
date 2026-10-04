/** Match explanation (Module 09): turns evaluation results into student-facing text. PURE. */

import type { Check, EligibilityStatus, MatchDecision, MatchResult, ProfileSection } from "./types";

export const STATUS_LABEL: Record<EligibilityStatus, string> = {
  likely_eligible: "Likely eligible",
  possibly_eligible: "Possibly eligible",
  not_eligible: "Not eligible",
  insufficient_information: "Insufficient information",
};

export const STATUS_DESCRIPTION: Record<EligibilityStatus, string> = {
  likely_eligible: "Every requirement we can check against your profile appears to be met. Always confirm the official requirements before applying.",
  possibly_eligible: "Some checks match, but others are unknown or need your confirmation.",
  not_eligible: "At least one clearly stated requirement does not match the information in your profile.",
  insufficient_information: "There is not enough reliable information to tell. Complete your profile or read the official requirements.",
};

/** Student-facing labels (Repair Session 3). "Eligible" always means "on the checks we can run", never a guarantee. */
export const DECISION_LABEL: Record<MatchDecision, string> = {
  eligible: "Eligible on the checks we can run",
  not_eligible: "Not eligible",
  needs_information: "Needs information from you",
  unknown: "Unknown",
};

export const DECISION_DESCRIPTION: Record<MatchDecision, string> = {
  eligible: "Every requirement we can check against your profile is met and nothing we check is left open. Written requirements, nationality, age and language scores are not checked: confirm them on the official site.",
  not_eligible: "At least one clearly stated requirement does not match the information in your profile.",
  needs_information: "We cannot decide yet because your profile is missing information. Add it and this result updates.",
  unknown: "We cannot decide from the data we hold. Read the official requirements; adding to your profile will not change this.",
};

export const PROFILE_HREF: Record<ProfileSection, string> = { education: "/profile#education", personal: "/profile" };

export type MissingItem = { section: ProfileSection; what: string; href: string };

export type MatchExplanation = {
  decision: MatchDecision;
  decisionLabel: string;
  decisionDescription: string;
  status: EligibilityStatus;
  statusLabel: string;
  statusDescription: string;
  /** e.g. "2 of 3 checks matched your profile" — a plain count, not a probability. */
  summary: string;
  matched: Check[];
  notMet: Check[];
  toConfirm: Check[];
  info: Check[];
  missing: MissingItem[];
};

export function explainResult(result: MatchResult): MatchExplanation {
  const checks = result.checks;
  const matched = checks.filter((c) => c.outcome === "met");
  const notMet = checks.filter((c) => c.outcome === "not_met");
  const toConfirm = checks.filter((c) => c.outcome === "unknown");
  const info = checks.filter((c) => c.outcome === "info");

  const seen = new Set<string>();
  const missing: MissingItem[] = [];
  for (const c of toConfirm) {
    if (!c.missing) continue;
    const key = `${c.missing.section}:${c.missing.what}`;
    if (seen.has(key)) continue;
    seen.add(key);
    missing.push({ section: c.missing.section, what: c.missing.what, href: PROFILE_HREF[c.missing.section] });
  }

  const checkable = checks.filter((c) => c.outcome !== "not_applicable" && c.outcome !== "info").length;
  const summary =
    checkable === 0
      ? "No checks could be run against your profile."
      : `${matched.length} of ${checkable} check${checkable === 1 ? "" : "s"} matched your profile.`;

  return {
    decision: result.decision,
    decisionLabel: DECISION_LABEL[result.decision],
    decisionDescription: DECISION_DESCRIPTION[result.decision],
    status: result.status,
    statusLabel: STATUS_LABEL[result.status],
    statusDescription: STATUS_DESCRIPTION[result.status],
    summary,
    matched,
    notMet,
    toConfirm,
    info,
    missing,
  };
}
