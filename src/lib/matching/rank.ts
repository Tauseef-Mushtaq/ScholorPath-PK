/**
 * Result filtering + sorting (Module 09). PURE and deterministic.
 *
 * Order (documented in ADR-031): eligibility tier (likely > possibly > insufficient > not eligible),
 * open/unknown deadlines before closed ones, more matched checks first, then the nearest deadline
 * (no deadline last), then name, then id. There is no numeric "score": `metCount` is a plain count
 * of checks that matched and is never a probability of being awarded a scholarship.
 */

import { evaluateScholarship } from "./eligibility";
import type { EligibilityStatus, MatchDecision, MatchOptions, MatchProfile, MatchResult, MatchScholarship, MatchSummary } from "./types";

const TIER: Record<EligibilityStatus, number> = {
  likely_eligible: 0,
  possibly_eligible: 1,
  insufficient_information: 2,
  not_eligible: 3,
};

export const PUBLIC_STATUS = "active";

export function compareResults(a: MatchResult, b: MatchResult): number {
  const tier = TIER[a.status] - TIER[b.status];
  if (tier) return tier;
  const aClosed = a.availability === "closed" ? 1 : 0;
  const bClosed = b.availability === "closed" ? 1 : 0;
  if (aClosed !== bClosed) return aClosed - bClosed;
  if (a.metCount !== b.metCount) return b.metCount - a.metCount;
  const ad = a.scholarship.deadline ?? "9999-12-31";
  const bd = b.scholarship.deadline ?? "9999-12-31";
  if (ad !== bd) return ad < bd ? -1 : 1;
  const an = a.scholarship.name ?? "";
  const bn = b.scholarship.name ?? "";
  if (an !== bn) return an < bn ? -1 : 1;
  return a.scholarship.id < b.scholarship.id ? -1 : a.scholarship.id > b.scholarship.id ? 1 : 0;
}

export function buildMatches(
  profile: MatchProfile,
  candidates: readonly MatchScholarship[],
  todayIso: string,
  options: MatchOptions,
): MatchSummary {
  const byStatus: Record<EligibilityStatus, number> = {
    likely_eligible: 0,
    possibly_eligible: 0,
    not_eligible: 0,
    insufficient_information: 0,
  };
  const byDecision: Record<MatchDecision, number> = { eligible: 0, not_eligible: 0, needs_information: 0, unknown: 0 };
  const counts = { candidates: candidates.length, shown: 0, hiddenNotRelevant: 0, hiddenClosed: 0, excludedNotPublic: 0, byStatus, byDecision };
  const results: MatchResult[] = [];

  for (const s of candidates) {
    // Defence in depth: the read layer already only returns what RLS exposes publicly (status = 'active').
    if (!s || s.status !== PUBLIC_STATUS) {
      counts.excludedNotPublic++;
      continue;
    }
    let result: MatchResult;
    try {
      result = evaluateScholarship(profile, s, todayIso);
    } catch {
      continue; // one malformed record must never break the page
    }
    if (result.availability === "closed" && !options.includeClosed) {
      counts.hiddenClosed++;
      continue;
    }
    if (!result.relevant && !options.showAll) {
      counts.hiddenNotRelevant++;
      continue;
    }
    byStatus[result.status]++;
    byDecision[result.decision]++;
    results.push(result);
  }

  results.sort(compareResults);
  counts.shown = results.length;
  return { results, counts };
}
