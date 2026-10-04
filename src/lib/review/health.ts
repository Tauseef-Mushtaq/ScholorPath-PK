/**
 * Final application health aggregation (Module 16 / FR-023). PURE.
 */

import {
  checkDocumentCompleteness,
  checkProfileCompleteness,
  checkTaskCompleteness,
  checkWritingReadiness,
} from "./completeness";
import { checkConsistency } from "./consistency";
import { checkDeadline } from "./deadline";
import { checkEligibilityItems } from "./eligibility-items";
import type { ApplicationHealth, ReviewInput, ReviewItem } from "./types";
import type { OverallStatus } from "./constants";

function countBy(items: ReviewItem[]) {
  let blockers = 0;
  let warnings = 0;
  let ok = 0;
  let info = 0;
  for (const i of items) {
    if (i.severity === "blocker") blockers++;
    else if (i.severity === "warn") warnings++;
    else if (i.severity === "ok") ok++;
    else info++;
  }
  return { blockers, warnings, ok, info };
}

function scoreFrom(items: ReviewItem[]): number {
  // Start at 100; blockers and warnings deduct. Ok items do not add above 100.
  let s = 100;
  for (const i of items) {
    if (i.severity === "blocker") s -= 25;
    else if (i.severity === "warn") s -= 8;
  }
  if (s < 0) s = 0;
  if (s > 100) s = 100;
  return s;
}

function overallFrom(counts: ReturnType<typeof countBy>, score: number): OverallStatus {
  if (counts.blockers > 0 || score < 40) return "not_ready";
  if (counts.warnings > 0 || score < 75) return "needs_work";
  return "ready";
}

function summaryFor(overall: OverallStatus, counts: ReturnType<typeof countBy>): string {
  if (overall === "ready") {
    return "No blockers found. Review warnings if any, then apply on the official website.";
  }
  if (overall === "not_ready") {
    return `${counts.blockers} blocker(s) and ${counts.warnings} warning(s). Resolve blockers before treating this application as ready.`;
  }
  return `${counts.warnings} warning(s) remain. Address them and re-run this review.`;
}

/** Build the full health report from structured inputs. */
export function buildApplicationHealth(input: ReviewInput): ApplicationHealth {
  const items: ReviewItem[] = [
    ...checkEligibilityItems(input.eligibility),
    ...checkProfileCompleteness(input.profile),
    ...checkDocumentCompleteness(input.documents),
    ...checkWritingReadiness(input.drafts),
    ...checkTaskCompleteness(input.tasks, input.todayIso),
    ...checkDeadline(input.scholarship.deadline, input.todayIso, input.scholarship.status),
    ...checkConsistency(input.profile, input.drafts),
  ];

  const counts = countBy(items);
  const score = scoreFrom(items);
  const overall = overallFrom(counts, score);

  return {
    overall,
    score,
    items,
    summary: summaryFor(overall, counts),
    counts,
  };
}
