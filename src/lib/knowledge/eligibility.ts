import { parseSourceUrl } from "./url-safety";

/**
 * Source eligibility for ingestion (ADR-033 §2). The schema has no "verified" or "official" flag and
 * `source_type` is free text, so the rule uses only what is stored and NEVER upgrades or interprets it:
 *   eligible  ⇔  source.active  ∧  scholarship.status = 'active'  ∧  last_verified_at is a valid, non-future date
 *                 ∧  source_url passes URL validation.
 * `source_type` / `priority` are carried along as recorded. Ingestion does not make a source "official".
 */
export type SourceRecord = {
  id: string;
  scholarshipId: string;
  scholarshipStatus: string | null;
  sourceUrl: string;
  sourceName: string | null;
  sourceType: string | null;
  priority: number;
  lastVerifiedAt: string | null;
  active: boolean;
};

export type IneligibleReason = "source_inactive" | "scholarship_not_active" | "never_verified" | "invalid_verified_date" | "invalid_source_url";
export type Eligibility = { eligible: true } | { eligible: false; reason: IneligibleReason };

export function evaluateSourceEligibility(s: SourceRecord, now: Date): Eligibility {
  if (!s.active) return { eligible: false, reason: "source_inactive" };
  if (s.scholarshipStatus !== "active") return { eligible: false, reason: "scholarship_not_active" };
  if (s.lastVerifiedAt === null || s.lastVerifiedAt === "") return { eligible: false, reason: "never_verified" };
  const t = Date.parse(s.lastVerifiedAt);
  if (!Number.isFinite(t) || t > now.getTime()) return { eligible: false, reason: "invalid_verified_date" };
  if (!parseSourceUrl(s.sourceUrl).ok) return { eligible: false, reason: "invalid_source_url" };
  return { eligible: true };
}
