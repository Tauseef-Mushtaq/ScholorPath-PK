/**
 * Pure publish-readiness gate (data pipeline repair). A scholarship may only move to `active`
 * (publicly visible) when it is traceable to an official source AND an admin has actually verified it.
 * Import can never satisfy this: imports create drafts with last_verified_at = null.
 */
export type ReadinessScholarship = {
  name: string | null; provider: string | null; country_id: string | null;
  degree_level: string | null; funding_type: string | null;
  official_information_url: string | null; official_application_url: string | null;
  last_verified_at: string | null;
};
export type ReadinessSource = { source_url: string | null; active: boolean; last_verified_at: string | null };

const HTTP_RE = /^https?:\/\/\S+$/i;
const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** Returns human-readable blockers; an empty array means the scholarship may be published. */
export function publishBlockers(s: ReadinessScholarship, sources: readonly ReadinessSource[]): string[] {
  const out: string[] = [];
  for (const [k, label] of [["name", "name"], ["provider", "provider"], ["country_id", "country"], ["degree_level", "degree level"], ["funding_type", "funding type"]] as const) {
    if (!filled(s[k])) out.push(`Missing required field: ${label}.`);
  }
  const hasOfficialUrl = [s.official_information_url, s.official_application_url].some((u) => filled(u) && HTTP_RE.test(u as string));
  if (!hasOfficialUrl) out.push("Add an official information or application URL.");
  const activeSources = sources.filter((x) => x.active && filled(x.source_url) && HTTP_RE.test(x.source_url as string));
  if (activeSources.length === 0) out.push("Add at least one active official source.");
  else if (!activeSources.some((x) => x.last_verified_at)) out.push("Mark at least one source as verified after checking it.");
  if (!s.last_verified_at) out.push("Mark the scholarship as verified after checking the official source.");
  return out;
}
