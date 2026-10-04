import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/public/page-header";
import { ScholarshipCard } from "@/components/public/scholarship-card";
import { EmptyState, UnavailableState } from "@/components/public/states";
import { DiscoveryPanel } from "@/components/scholarship/discovery-panel";
import { Button } from "@/components/ui/button";
import { FilterAutoSubmit } from "@/components/public/filter-auto-submit";
import { getAuthState } from "@/lib/auth/session";
import { FUNDING_LABELS } from "@/lib/public/format";
import {
  DEADLINE_WINDOWS,
  filtersKey,
  hasActiveFilters,
  PAGE_SIZE,
  parseScholarshipFilters,
  scholarshipsHref,
} from "@/lib/public/filters";
import { getFilterOptions, getScholarships, loadSoft } from "@/lib/public/queries";
import type { FundingType, ScholarshipFilters } from "@/lib/public/types";

export const metadata: Metadata = {
  title: "Browse scholarships",
  description:
    "Browse international scholarships for Pakistani students. Filter by country, degree, field, funding and deadline, then check the official requirements.",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function ScholarshipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseScholarshipFilters(await searchParams);
  const auth = await getAuthState();   // display only: decides whether to offer the assistant; the API route authenticates on its own

  // Any failure (not configured OR a failed query) becomes the in-page "unavailable" state, never a crash.
  const loaded = await loadSoft(async () => {
    const [options, result] = await Promise.all([getFilterOptions(), getScholarships(filters)]);
    return { options, ...result };
  });

  const chips: { key: string; label: string; clear: Partial<ScholarshipFilters> }[] = [];
  if (loaded) {
    if (filters.q) chips.push({ key: "q", label: `Search: ${filters.q}`, clear: { q: undefined } });
    if (filters.country) chips.push({ key: "country", label: loaded.options.countries.find((c) => c.slug === filters.country)?.name ?? filters.country, clear: { country: undefined } });
    if (filters.university) chips.push({ key: "university", label: loaded.options.universities.find((u) => u.slug === filters.university)?.name ?? filters.university, clear: { university: undefined } });
    if (filters.degree) chips.push({ key: "degree", label: filters.degree, clear: { degree: undefined } });
    if (filters.field) chips.push({ key: "field", label: filters.field, clear: { field: undefined } });
    if (filters.funding) chips.push({ key: "funding", label: FUNDING_LABELS[filters.funding], clear: { funding: undefined } });
    if (filters.deadlineDays) chips.push({ key: "deadline", label: `Deadline within ${filters.deadlineDays} days`, clear: { deadlineDays: undefined } });
    if (filters.openOnly) chips.push({ key: "open", label: "Hiding closed deadlines", clear: { openOnly: false } });
  }

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Browse scholarships"
        description="Filter by what matters to you, then open a scholarship to read its requirements and official links."
      />

      {auth.isAuthenticated ? (
        <DiscoveryPanel />
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
          <Link href="/login?next=/scholarships" className="underline underline-offset-4">Sign in</Link> to describe the scholarship you want in your own words and let the assistant search for you.
        </p>
      )}

      {!loaded ? (
        <UnavailableState />
      ) : (
        <>
          {/* key: the inputs are uncontrolled (defaultValue). Without remounting when the URL filters change
              (Reset link, chip x, back/forward are client navigations) the old selections stay in the DOM and
              the next Apply silently re-submits them, producing an empty result. */}
          <form
            key={filtersKey(filters)}
            method="get"
            action="/scholarships"
            role="search"
            aria-label="Filter scholarships"
            className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <label htmlFor="q" className="text-sm font-medium">
                Search scholarships
              </label>
              <input
                id="q"
                name="q"
                type="search"
                maxLength={80}
                defaultValue={filters.q ?? ""}
                placeholder="Name, provider, university, country, field…"
                aria-describedby="q-hint"
                className={selectClass}
              />
              <p id="q-hint" className="text-xs text-muted-foreground">
                Every word must match somewhere in the name, provider, field, degree, eligibility summary, university or country.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="country" className="text-sm font-medium">Country</label>
              <select id="country" name="country" defaultValue={filters.country ?? ""} className={selectClass}>
                <option value="">All countries</option>
                {loaded.options.countries.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>

            {loaded.options.universities.length > 0 ? (
              <div className="space-y-1.5">
                <label htmlFor="university" className="text-sm font-medium">University</label>
                <select id="university" name="university" defaultValue={filters.university ?? ""} className={selectClass}>
                  <option value="">All universities</option>
                  {loaded.options.universities.map((u) => (
                    <option key={u.slug} value={u.slug}>{u.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="degree" className="text-sm font-medium">Degree</label>
              <select id="degree" name="degree" defaultValue={filters.degree ?? ""} className={selectClass}>
                <option value="">All degrees</option>
                {loaded.options.degrees.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="field" className="text-sm font-medium">Field</label>
              <select id="field" name="field" defaultValue={filters.field ?? ""} className={selectClass}>
                <option value="">All fields</option>
                {loaded.options.fields.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="funding" className="text-sm font-medium">Funding</label>
              <select id="funding" name="funding" defaultValue={filters.funding ?? ""} className={selectClass}>
                <option value="">Any funding</option>
                {(Object.keys(FUNDING_LABELS) as FundingType[]).map((t) => (
                  <option key={t} value={t}>{FUNDING_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="deadline" className="text-sm font-medium">Deadline</label>
              <select id="deadline" name="deadline" defaultValue={filters.deadlineDays ? String(filters.deadlineDays) : ""} className={selectClass}>
                <option value="">Any deadline</option>
                {DEADLINE_WINDOWS.map((d) => (
                  <option key={d} value={d}>Within {d} days</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sort" className="text-sm font-medium">Sort by</label>
              <select id="sort" name="sort" defaultValue={filters.sort} className={selectClass}>
                <option value="deadline">Deadline (soonest first)</option>
                <option value="name">Name (A to Z)</option>
              </select>
            </div>

            <div className="flex items-end gap-2 pb-1.5">
              <input
                id="open"
                name="open"
                type="checkbox"
                value="1"
                defaultChecked={filters.openOnly}
                className="size-4 accent-[var(--primary)]"
              />
              <label htmlFor="open" className="text-sm font-medium">Hide closed deadlines</label>
            </div>

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
              <Button type="submit">Apply filters</Button>
              {hasActiveFilters(filters) ? (
                <Button asChild variant="outline">
                  <Link href="/scholarships">Reset filters</Link>
                </Button>
              ) : null}
            </div>
            <FilterAutoSubmit />
          </form>

          {chips.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.key}>
                  <Link
                    href={scholarshipsHref(filters, { ...c.clear, page: 1 })}
                    className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove filter: ${c.label}`}
                  >
                    {c.label} <span aria-hidden>×</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {loaded.total === 0
              ? "No scholarships to show"
              : `${loaded.total} ${loaded.total === 1 ? "scholarship" : "scholarships"} found${
                  loaded.total > PAGE_SIZE
                    ? ` (showing ${(filters.page - 1) * PAGE_SIZE + 1}–${Math.min(filters.page * PAGE_SIZE, loaded.total)})`
                    : ""
                }`}
          </p>

          {loaded.items.length === 0 ? (
            hasActiveFilters(filters) ? (
              <EmptyState
                title="No scholarships match these filters"
                description="Try removing a filter or searching with different words."
                action={{ href: "/scholarships", label: "Reset filters" }}
              />
            ) : (
              <EmptyState
                title="No scholarships are available yet"
                description="Scholarships are added after their details are checked against official sources. Please check back soon."
              />
            )
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {loaded.items.map((s) => (
                <li key={s.id}>
                  <ScholarshipCard scholarship={s} />
                </li>
              ))}
            </ul>
          )}

          {loaded.total > PAGE_SIZE ? (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
              {filters.page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={scholarshipsHref(filters, { page: filters.page - 1 })} rel="prev">Previous</Link>
                </Button>
              ) : <span />}
              <span className="text-sm text-muted-foreground">
                Page {filters.page} of {Math.ceil(loaded.total / PAGE_SIZE)}
              </span>
              {filters.page * PAGE_SIZE < loaded.total ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={scholarshipsHref(filters, { page: filters.page + 1 })} rel="next">Next</Link>
                </Button>
              ) : <span />}
            </nav>
          ) : null}
        </>
      )}
    </PageContainer>
  );
}
