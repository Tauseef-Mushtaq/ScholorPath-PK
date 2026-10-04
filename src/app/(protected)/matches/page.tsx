import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseZap, UserRoundPen } from "lucide-react";

import { MatchCard } from "@/components/matches/match-card";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/public/states";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { assessProfile, buildMatches, matchesHref, parseMatchParams } from "@/lib/matching";
import { CANDIDATE_LIMIT, loadCandidateScholarships, loadMatchProfile } from "@/lib/matching/queries";
import { PAGE_SIZE } from "@/lib/public/filters";
import { todayIsoDate } from "@/lib/public/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My scholarship matches",
  robots: { index: false, follow: false },
};

function Unavailable() {
  return (
    <EmptyState
      icon={DatabaseZap}
      title="Your matches are temporarily unavailable"
      description="We couldn't load your matches right now. Please try again in a little while."
    />
  );
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Identity comes ONLY from the server session. No query parameter can select another student's profile.
  const { user } = await requireUser();
  const params = parseMatchParams(await searchParams);

  const header = (
    <header className="space-y-2">
      <h1 className="text-3xl font-bold tracking-tight">My scholarship matches</h1>
      <p className="max-w-3xl text-muted-foreground">
        Published scholarships compared with the education details in your profile, with the reasons shown for each.
        This is a guide, not a decision: always confirm the requirements on the official site before you apply.
      </p>
    </header>
  );

  if (!isSupabaseConfigured()) {
    return (
      <PageContainer className="space-y-6">
        {header}
        <Unavailable />
      </PageContainer>
    );
  }

  const profile = await loadMatchProfile(await createClient(), user.id);
  if (!profile.ok) {
    return (
      <PageContainer className="space-y-6">
        {header}
        <Unavailable />
      </PageContainer>
    );
  }

  const assessment = assessProfile(profile.data);
  if (assessment.readiness === "empty") {
    return (
      <PageContainer className="space-y-6">
        {header}
        <EmptyState
          icon={UserRoundPen}
          title="Add your education to see matches"
          description={assessment.gaps[0].why}
          action={{ href: assessment.gaps[0].href, label: "Add education to my profile" }}
        />
      </PageContainer>
    );
  }

  const today = todayIsoDate();
  const candidates = await loadCandidateScholarships(params.includeClosed, today);
  if (!candidates.ok) {
    return (
      <PageContainer className="space-y-6">
        {header}
        <Unavailable />
      </PageContainer>
    );
  }

  const summary = buildMatches(profile.data, candidates.data.items, today, params);
  const totalPages = Math.max(1, Math.ceil(summary.results.length / PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const pageItems = summary.results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const { counts } = summary;

  return (
    <PageContainer className="space-y-6">
      {header}

      <details className="rounded-xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">How matching works</summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            We compare three things with your profile: your <strong className="text-foreground">education level</strong>{" "}
            against the scholarship&apos;s degree level, your <strong className="text-foreground">CGPA</strong> against any minimum
            GPA, and your <strong className="text-foreground">field of study</strong> against the scholarship&apos;s field.
          </p>
          <p>
            Each scholarship gets one of four answers: <strong className="text-foreground">Eligible on the checks we can run</strong>,{" "}
            <strong className="text-foreground">Not eligible</strong>,{" "}
            <strong className="text-foreground">Needs information from you</strong> (something is missing in your profile) or{" "}
            <strong className="text-foreground">Unknown</strong> (we cannot decide from the data we hold). Missing information is never
            treated as eligible, and never as a reason you are ineligible.
          </p>
          <p>
            <strong className="text-foreground">Not checked at all:</strong> nationality rules, age, English test scores, research
            experience, your preferences, and the written requirements of each scholarship. Those are listed as &ldquo;needs your
            confirmation&rdquo; or &ldquo;not checked&rdquo;. Matches are ordered by how many checks match, then by deadline. There is no
            score and no prediction of whether you would be selected.
          </p>
        </div>
      </details>

      {assessment.readiness === "partial" ? (
        <section aria-labelledby="gaps-heading" className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 dark:bg-amber-500/10">
          <h2 id="gaps-heading" className="text-sm font-semibold">
            Complete your profile for more accurate matches
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {assessment.gaps.map((g) => (
              <li key={g.what}>
                <Link href={g.href} className="font-medium underline underline-offset-2">
                  {g.what}
                </Link>
                <span className="text-muted-foreground"> — {g.why}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {candidates.data.truncated ? (
        <p role="status" className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          Only the first {CANDIDATE_LIMIT} published scholarships were compared. Use the{" "}
          <Link href="/scholarships" className="underline underline-offset-2">
            scholarship search
          </Link>{" "}
          to browse the rest.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p role="status">
          {counts.shown === 0
            ? "No scholarships to show."
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + pageItems.length} of ${counts.shown} scholarship${counts.shown === 1 ? "" : "s"}.`}
        </p>
        <nav aria-label="Match options" className="flex flex-wrap gap-2">
          {params.showAll ? (
            <Button asChild variant="outline" size="sm">
              <Link href={matchesHref(params, { showAll: false, page: 1 })}>Show only relevant matches</Link>
            </Button>
          ) : counts.hiddenNotRelevant > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={matchesHref(params, { showAll: true, page: 1 })}>
                Show {counts.hiddenNotRelevant} more in other fields or levels
              </Link>
            </Button>
          ) : null}
          {params.includeClosed ? (
            <Button asChild variant="outline" size="sm">
              <Link href={matchesHref(params, { includeClosed: false, page: 1 })}>Hide closed scholarships</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={matchesHref(params, { includeClosed: true, page: 1 })}>
                Include closed scholarships{counts.hiddenClosed > 0 ? ` (${counts.hiddenClosed})` : ""}
              </Link>
            </Button>
          )}
        </nav>
      </div>

      {pageItems.length === 0 ? (
        <EmptyState
          title="No matching scholarships right now"
          description={
            counts.candidates === 0
              ? "There are no published scholarships yet. Check back soon or browse the scholarship list."
              : "Nothing currently published fits your profile. Try including other fields or closed scholarships, update your profile, or browse all scholarships."
          }
          action={{ href: "/scholarships", label: "Browse all scholarships" }}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {pageItems.map((r) => (
            <MatchCard key={r.scholarship.id} result={r} />
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={matchesHref(params, { page: page - 1 })}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={matchesHref(params, { page: page + 1 })}>Next</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </PageContainer>
  );
}
