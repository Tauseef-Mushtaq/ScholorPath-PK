import type { MatchResult } from "../matching/types";
import type { EligibilityData, EligibilityLabel, MissingInfo } from "./types";

/**
 * Maps the deterministic Module 09 result to the agent's four labels. Nothing is inferred:
 *  - a not-met mandatory check => not_eligible
 *  - a mandatory check that is unknown because the PROFILE lacks data => needs_information
 *  - nothing checkable (scholarship documents no criteria, or no check could be evaluated) => unknown
 *  - `eligible` ONLY when every documented, checkable criterion is met; `limitations` always lists what was not evaluated.
 */
export function toEligibilityData(m: MatchResult): EligibilityData {
  const missing: MissingInfo[] = [];
  for (const c of m.checks) {
    if (c.outcome === "unknown" && c.mandatory) {
      missing.push(c.missing ? { what: c.missing.what, where: "profile" } : { what: c.label, where: "scholarship_data" });
    }
  }
  let status: EligibilityLabel;
  if (m.status === "not_eligible") status = "not_eligible";
  else if (m.status === "likely_eligible") status = "eligible";
  else if (m.checks.some((c) => c.outcome === "unknown" && c.mandatory && c.missing)) status = "needs_information";
  else status = "unknown";
  return {
    scholarshipId: m.scholarship.id,
    status,
    checks: m.checks.map((c) => ({ key: c.key, label: c.label, outcome: c.outcome, detail: c.detail })),
    missing,
    limitations: [
      "Only the criteria recorded in structured form for this scholarship were evaluated.",
      "Nationality, age, language-test scores and the provider's free-text eligibility summary are not evaluated automatically.",
      "Always confirm eligibility on the official scholarship page.",
    ],
  };
}
