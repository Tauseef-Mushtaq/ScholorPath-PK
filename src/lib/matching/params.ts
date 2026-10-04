import type { MatchOptions } from "./types";

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export type MatchParams = MatchOptions & { page: number };

/**
 * /matches query parameters. Only three whitelisted, non-identifying options exist; any other parameter
 * (including a forged `user_id` / `profile_id`) is ignored — identity comes from the session only.
 */
export function parseMatchParams(raw: Raw): MatchParams {
  const page = Number.parseInt(first(raw.page) ?? "1", 10);
  return {
    showAll: first(raw.show) === "all",
    includeClosed: first(raw.closed) === "1",
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), 200) : 1,
  };
}

export function matchesHref(params: MatchParams, overrides: Partial<MatchParams> = {}): string {
  const p = { ...params, ...overrides };
  const qs = new URLSearchParams();
  if (p.showAll) qs.set("show", "all");
  if (p.includeClosed) qs.set("closed", "1");
  if (p.page > 1) qs.set("page", String(p.page));
  const s = qs.toString();
  return s ? `/matches?${s}` : "/matches";
}
