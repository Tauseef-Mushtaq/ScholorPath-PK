/**
 * Map matching engine decision into review items (Module 16). PURE.
 */

import type { ReviewEligibilityInput, ReviewItem } from "./types";

function item(
  id: string,
  severity: ReviewItem["severity"],
  title: string,
  detail: string,
): ReviewItem {
  return { id, category: "eligibility", severity, title, detail };
}

export function checkEligibilityItems(eligibility: ReviewEligibilityInput | null): ReviewItem[] {
  if (!eligibility) {
    return [
      item(
        "eligibility-unavailable",
        "info",
        "Eligibility not evaluated",
        "Could not load matching data for this scholarship. Check the Matches page after updating your profile.",
      ),
    ];
  }

  const d = eligibility.decision.toLowerCase();
  const out: ReviewItem[] = [];

  if (d === "eligible" || d === "strong_match") {
    out.push(
      item(
        "eligibility-ok",
        "ok",
        "Appears eligible",
        "Deterministic rules found no hard disqualifiers. Always re-check official requirements.",
      ),
    );
  } else if (d === "possible" || d === "possible_match" || d === "needs_information") {
    out.push(
      item(
        "eligibility-possible",
        "warn",
        "Eligibility needs confirmation",
        "Some rules are unknown or only partially met. Review the Matches page and official criteria.",
      ),
    );
  } else if (d === "not_eligible") {
    out.push(
      item(
        "eligibility-not",
        "blocker",
        "Not eligible under recorded data",
        "Matching rules report not eligible. Confirm official criteria before investing more effort.",
      ),
    );
  } else {
    out.push(
      item(
        "eligibility-unknown",
        "info",
        "Eligibility status unclear",
        `Engine decision: ${eligibility.decision}.`,
      ),
    );
  }

  for (const c of eligibility.checks.slice(0, 12)) {
    const outcome = c.outcome.toLowerCase();
    if (outcome === "not_met" || outcome === "fail") {
      out.push(
        item(
          `eligibility-check-${c.id}`,
          "warn",
          c.label || "Requirement not met",
          `Check outcome: ${c.outcome}.`,
        ),
      );
    }
  }

  return out;
}
