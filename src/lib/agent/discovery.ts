import { parseScholarshipLevels } from "../matching/normalize";
import { escapeSearch, MAX_SEARCH_TOKENS, MAX_TOKEN_LENGTH } from "../public/filters";
import { FUNDING_LABELS } from "../public/format";
import type { ScholarshipFilters, ScholarshipListItem as CatalogItem } from "../public/types";
import type { AppliedCriteria, Candidate, DiscoveryResult, FundingKind, SearchCriteria, SearchData, ToolResult, UnresolvedCriterion } from "./types";
import { cleanText, type Parsed } from "./validators";

/**
 * Scholarship discovery (Repair Session 4). Pure: no I/O. The ONLY job of the model is to produce `SearchCriteria` (data).
 * Everything after that is server code: validation -> resolution against the REAL database vocabulary -> the EXISTING
 * Module 08 search (`getScholarships`, injected) -> a decision on what the student sees. There is no second search system:
 * this module only builds `ScholarshipFilters` and hands them to the function the /scholarships page already uses.
 */

// ---------------------------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------------------------
/** Letters, digits, spaces and a few harmless punctuation marks. Anything resembling SQL, markup or query syntax is refused outright. */
const TEXT_OK = /^[\p{L}\p{N}\s'’.,:&+/()-]+$/u;
const MAX_TEXT = 80;
const FUNDING: readonly unknown[] = ["fully_funded", "partially_funded", "not_funded"];
const DEADLINES: readonly unknown[] = [30, 90, 180];

function critText(v: unknown, max: number): Parsed<string | null> {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const t = cleanText(v);
  if (!t) return { ok: true, value: null };
  if (t.length < 2 || t.length > max || !TEXT_OK.test(t)) return { ok: false };   // a 1-character term is never a usable criterion
  return { ok: true, value: t };
}

/** A criteria object needs at least one real constraint; `openOnly` alone would list "everything that is open". */
export const hasSubstance = (c: SearchCriteria): boolean => Boolean(c.query || c.country || c.degree || c.field || c.funding || c.deadlineDays);

/** Validates criteria under the internal field names. Used for the model's reply AND for the tool input (policy layer). */
export function parseCriteriaFields(raw: Record<string, unknown>): Parsed<SearchCriteria> {
  const query = critText(raw.query, 100), country = critText(raw.country, MAX_TEXT), degree = critText(raw.degree, MAX_TEXT), field = critText(raw.field, MAX_TEXT);
  if (!query.ok || !country.ok || !degree.ok || !field.ok) return { ok: false };
  const f = raw.funding;
  if (f !== undefined && f !== null && !FUNDING.includes(f)) return { ok: false };
  const d = raw.deadlineDays;
  if (d !== undefined && d !== null && !DEADLINES.includes(d)) return { ok: false };
  if (raw.openOnly !== undefined && typeof raw.openOnly !== "boolean") return { ok: false };
  const value: SearchCriteria = {
    query: query.value, country: country.value, degree: degree.value, field: field.value,
    funding: (f ?? null) as FundingKind | null, deadlineDays: (d ?? null) as SearchCriteria["deadlineDays"], openOnly: raw.openOnly === true,
  };
  return hasSubstance(value) ? { ok: true, value } : { ok: false };
}

// ---------------------------------------------------------------------------------------------------------------
// Resolution against the real database vocabulary
// ---------------------------------------------------------------------------------------------------------------
export type FilterVocabulary = { countries: readonly { name: string; slug: string }[]; degrees: readonly string[]; fields: readonly string[] };
export type ResolvedSearch = { filters: ScholarshipFilters[]; applied: AppliedCriteria; unresolved: UnresolvedCriterion[]; dropped: string[] };

const MAX_COMBOS = 6;
/** Words that would only make the AND-ed keyword search fail ("and" must otherwise appear somewhere in the row). */
const KEYWORD_STOP = new Set(["a", "an", "and", "or", "of", "in", "on", "the", "for", "to", "with", "at", "by", "from", "studies", "study"]);
const norm = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
const unique = <T,>(a: T[]): T[] => [...new Set(a)];
/**
 * Does the database's free-text degree wording `stored` fit the degree the student asked for? Uses the Module 09 level parser,
 * so "master", "Masters", "MSc" and "Master's and PhD" are all recognised as master's. A stored wording that allows any level
 * fits every request (the same rule the matching engine uses).
 */
function degreeFits(requested: ReturnType<typeof parseScholarshipLevels>, stored: string): boolean {
  if (requested.kind !== "levels") return false;
  const have = parseScholarshipLevels(stored);
  if (have.kind === "any") return true;
  return have.kind === "levels" && requested.levels.every((l) => have.levels.includes(l));
}
/**
 * Tokenised like the Module 08 search (escape, lowercase, 40-char tokens) but WITHOUT its 5-token cap: that helper truncates
 * silently, and truncation broadens a search. We cap here instead so that anything left out is reported in `dropped`.
 */
const keywordTokens = (text: string | null): string[] =>
  unique(escapeSearch(text ?? "").toLowerCase().split(" ").filter(Boolean).map((t) => t.slice(0, MAX_TOKEN_LENGTH))).filter((t) => t.length > 1 && !KEYWORD_STOP.has(t));

/**
 * Turns validated criteria into `ScholarshipFilters` for the existing search:
 *  - country: must be a country that exists in the database (by name or slug). An unknown country is NEVER dropped (that would
 *    return unrelated scholarships); it is reported as unresolved and no search is run.
 *  - degree: mapped to the database's own degree wordings through the Module 09 level parser ("master" -> "Master's", "MSc", ...).
 *  - field: an exact (case-insensitive) database value becomes a field filter; anything else becomes keywords for the
 *    existing keyword search (which already matches the field column).
 */
export function resolveCriteria(c: SearchCriteria, vocab: FilterVocabulary): ResolvedSearch {
  const unresolved: UnresolvedCriterion[] = [];
  const dropped: string[] = [];

  let countrySlug: string | undefined;
  let countryName: string | null = null;
  if (c.country) {
    const n = norm(c.country);
    const hit = vocab.countries.find((x) => norm(x.name) === n || x.slug === n);
    if (hit) { countrySlug = hit.slug; countryName = hit.name; } else unresolved.push({ criterion: "country", requested: c.country });
  }

  let degreeValues: string[] = [];
  if (c.degree) {
    const n = norm(c.degree);
    const want = parseScholarshipLevels(c.degree);
    const exact = vocab.degrees.filter((d) => norm(d) === n);
    const byLevel = vocab.degrees.filter((d) => degreeFits(want, d));
    degreeValues = unique([...exact, ...byLevel]);
    // "any degree" is a request without a restriction, not an unknown degree
    if (!degreeValues.length && want.kind !== "any") unresolved.push({ criterion: "degree", requested: c.degree });
  }

  let fieldValues: string[] = [];
  let fieldTokens: string[] = [];
  let field: AppliedCriteria["field"] = null;
  if (c.field) {
    const n = norm(c.field);
    fieldValues = unique(vocab.fields.filter((f) => norm(f) === n));
    if (fieldValues.length) field = { value: c.field, mode: "exact" };
    else { fieldTokens = keywordTokens(c.field); field = { value: c.field, mode: "keywords" }; }
  }

  const all = unique([...fieldTokens, ...keywordTokens(c.query)]);
  const tokens = all.slice(0, MAX_SEARCH_TOKENS);
  dropped.push(...all.slice(MAX_SEARCH_TOKENS));

  const degreeOpts: (string | undefined)[] = degreeValues.length ? degreeValues : [undefined];
  const fieldOpts: (string | undefined)[] = fieldValues.length ? fieldValues : [undefined];
  const combos = degreeOpts.flatMap((d) => fieldOpts.map((f) => ({ d, f })));
  if (combos.length > MAX_COMBOS) dropped.push("some degree/field wordings");

  const filters: ScholarshipFilters[] = unresolved.length ? [] : combos.slice(0, MAX_COMBOS).map(({ d, f }) => ({
    q: tokens.length ? tokens.join(" ") : undefined, country: countrySlug, degree: d, field: f, funding: c.funding ?? undefined,
    deadlineDays: c.deadlineDays ?? undefined, openOnly: c.openOnly, sort: "deadline" as const, page: 1,
  }));
  const applied: AppliedCriteria = { keywords: tokens, country: countryName, degree: degreeValues, field, funding: c.funding, deadlineDays: c.deadlineDays, openOnly: c.openOnly };
  return { filters, applied, unresolved, dropped };
}

// ---------------------------------------------------------------------------------------------------------------
// The search adapter's logic (I/O injected: the real wiring passes the Module 08 functions)
// ---------------------------------------------------------------------------------------------------------------
export type CatalogDeps = {
  /** Real countries / degree wordings / fields from the database. */
  loadVocabulary: () => Promise<FilterVocabulary>;
  /** The EXISTING Module 08 search (`getScholarships`). */
  searchCatalog: (filters: ScholarshipFilters) => Promise<{ items: readonly CatalogItem[]; total: number }>;
};

const toCandidate = (r: CatalogItem): Candidate => ({
  id: r.id, name: r.name, provider: r.provider, degreeLevel: r.degreeLevel, field: r.field, fundingType: r.fundingType,
  deadline: r.deadline, country: r.country?.name ?? null, university: r.university?.name ?? null,
});
const byDeadline = (a: Candidate, b: Candidate) =>
  (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31") || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export async function runCatalogSearch(input: SearchCriteria & { limit: number }, deps: CatalogDeps): Promise<ToolResult<"searchScholarships">> {
  const unavailable = { ok: false as const, tool: "searchScholarships" as const, error: "unavailable" as const };
  let vocab: FilterVocabulary;
  try { vocab = await deps.loadVocabulary(); } catch { return unavailable; }
  const r = resolveCriteria(input, vocab);
  // A requested criterion that does not exist in the database means nothing can match: do not search, do not broaden.
  if (r.unresolved.length) return { ok: true, tool: "searchScholarships", data: { items: [], total: 0, applied: r.applied, unresolved: r.unresolved, dropped: r.dropped } };
  const seen = new Map<string, Candidate>();
  let total = 0;
  try {
    for (const f of r.filters) {
      const res = await deps.searchCatalog(f);
      total += Number.isFinite(res.total) ? res.total : 0;
      for (const row of res.items) if (!seen.has(row.id)) seen.set(row.id, toCandidate(row));
    }
  } catch { return unavailable; }
  const items = [...seen.values()].sort(byDeadline).slice(0, input.limit);
  return { ok: true, tool: "searchScholarships", data: { items, total: Math.max(total, seen.size), applied: r.applied, unresolved: [], dropped: r.dropped } };
}

// ---------------------------------------------------------------------------------------------------------------
// What the student gets: selection state + a server-built explanation
// ---------------------------------------------------------------------------------------------------------------
export function describeCriteria(a: AppliedCriteria): string {
  const parts: string[] = [];
  if (a.country) parts.push(a.country);
  if (a.degree.length) parts.push(a.degree.join(" / "));
  if (a.field) parts.push(a.field.value);
  if (a.funding) parts.push(FUNDING_LABELS[a.funding].toLowerCase());
  if (a.deadlineDays) parts.push(`deadline within ${a.deadlineDays} days`);
  if (a.openOnly) parts.push("open deadlines only");
  const fieldWords = a.field?.mode === "keywords" ? keywordTokens(a.field.value) : [];
  const extra = a.keywords.filter((k) => !fieldWords.includes(k));
  if (extra.length) parts.push(`keywords: ${extra.join(" ")}`);
  return parts.join(" · ") || "no filters";
}

/**
 * Exactly one real match (and nothing was left out) -> selected. Several -> the student chooses; the agent NEVER picks.
 * None (or a criterion the database does not know) -> a correct "no results" state. Never an invented row.
 */
export function decideDiscovery(search: SearchData): DiscoveryResult {
  const desc = describeCriteria(search.applied);
  const base = { criteria: search.applied, candidates: search.items, total: search.total, unresolved: search.unresolved };
  if (search.unresolved.length) {
    const what = search.unresolved.map((u) => `${u.criterion} “${u.requested}”`).join(" and ");
    return { ...base, state: "no_results", selectedId: null, explanation: `No scholarship recorded in ScholarPath matches: the ${what} is not in the database, so I did not search. Nothing was changed.` };
  }
  if (search.items.length === 0) return { ...base, state: "no_results", selectedId: null, explanation: `No scholarship recorded in ScholarPath matches (${desc}). Try removing one filter, such as the field or the funding type.` };
  if (search.items.length === 1 && search.total === 1 && search.dropped.length === 0) {
    return { ...base, state: "selected", selectedId: search.items[0].id, explanation: `One scholarship matches (${desc}): ${search.items[0].name}. Open it to read the recorded requirements.` };
  }
  const shown = search.items.length < search.total ? ` Showing ${search.items.length} of ${search.total}.` : "";
  const cut = search.dropped.length ? ` Some terms could not be applied (${search.dropped.join(", ")}), so these may be broader than you asked.` : "";
  return { ...base, state: "selection_required", selectedId: null, explanation: `${search.total} scholarships match (${desc}).${shown}${cut} Choose one; I will not pick for you.` };
}

export const invalidCriteriaResult = (): DiscoveryResult => ({
  state: "invalid_criteria", criteria: null, candidates: [], total: 0, selectedId: null, unresolved: [],
  explanation: "I could not turn that into a search. Mention at least a country, a degree level, a field of study, a funding type or a scholarship name.",
});
