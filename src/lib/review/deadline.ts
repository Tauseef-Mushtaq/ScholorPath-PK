/**
 * Deadline status for application health (Module 16). PURE.
 */

import type { ReviewItem } from "./types";

function item(
  id: string,
  severity: ReviewItem["severity"],
  title: string,
  detail: string,
): ReviewItem {
  return { id, category: "deadline", severity, title, detail };
}

/** Days from todayIso to deadlineIso (negative if past). Both YYYY-MM-DD. */
export function daysUntil(deadlineIso: string, todayIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineIso) || !/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) return null;
  const t0 = Date.parse(`${todayIso}T00:00:00Z`);
  const t1 = Date.parse(`${deadlineIso}T00:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return Math.round((t1 - t0) / 86_400_000);
}

export function checkDeadline(deadline: string | null, todayIso: string, scholarshipStatus: string): ReviewItem[] {
  const out: ReviewItem[] = [];
  if (scholarshipStatus && scholarshipStatus !== "active") {
    out.push(
      item(
        "deadline-inactive",
        "blocker",
        "Scholarship not active",
        `Catalogue status is "${scholarshipStatus}". Prefer active, published opportunities.`,
      ),
    );
  }
  if (!deadline) {
    out.push(
      item(
        "deadline-unknown",
        "warn",
        "No deadline on record",
        "Confirm the official closing date on the provider website.",
      ),
    );
    return out;
  }
  const days = daysUntil(deadline, todayIso);
  if (days == null) {
    out.push(item("deadline-invalid", "info", "Deadline format unclear", `Recorded value: ${deadline}`));
    return out;
  }
  if (days < 0) {
    out.push(
      item(
        "deadline-passed",
        "blocker",
        "Deadline has passed",
        `Deadline was ${deadline} (${Math.abs(days)} day(s) ago). Confirm whether late applications are accepted on the official site.`,
      ),
    );
  } else if (days <= 7) {
    out.push(
      item(
        "deadline-urgent",
        "warn",
        "Deadline within 7 days",
        `Deadline is ${deadline} (${days} day(s) left). Prioritise remaining tasks.`,
      ),
    );
  } else if (days <= 30) {
    out.push(
      item(
        "deadline-soon",
        "info",
        "Deadline within 30 days",
        `Deadline is ${deadline} (${days} day(s) left).`,
      ),
    );
  } else {
    out.push(
      item(
        "deadline-ok",
        "ok",
        "Deadline not imminent",
        `Deadline is ${deadline} (${days} day(s) left).`,
      ),
    );
  }
  return out;
}
