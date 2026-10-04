import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { FundingBadge } from "@/components/public/funding-badge";
import { UnavailableState } from "@/components/public/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Fact, Section } from "@/components/scholarship/detail-parts";
import { AssistantPanel } from "@/components/scholarship/assistant-panel";
import { RequirementList } from "@/components/scholarship/requirement-list";
import { SourcesSection } from "@/components/scholarship/sources-section";
import { VerificationNotice } from "@/components/scholarship/verification-notice";
import { StartApplicationButton } from "@/components/applications/start-application-button";
import { getAuthState } from "@/lib/auth/session";
import { applicationPhase, buildSources, linkView, splitRequirements, verificationState } from "@/lib/public/detail";
import {
  formatDate,
  formatGpa,
  FUNDING_EXPLANATIONS,
  FUNDING_LABELS,
  isUuid,
  NOT_AVAILABLE,
  todayIsoDate,
  truncate,
} from "@/lib/public/format";
import { getScholarshipById, loadOrUnavailable } from "@/lib/public/queries";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Scholarship not found" };

  const s = await loadOrUnavailable(() => getScholarshipById(id)).catch(() => null);
  if (!s) return { title: "Scholarship" };

  const description = s.eligibilitySummary
    ? truncate(s.eligibilitySummary, 155)
    : truncate(
        `${s.name} from ${s.provider}${s.country ? ` in ${s.country.name}` : ""}. ${FUNDING_LABELS[s.fundingType]} ${s.degreeLevel} scholarship. Check requirements and official links.`,
        155,
      );
  return { title: s.name, description, alternates: { canonical: `/scholarships/${s.id}` } };
}

const PHASE_VARIANT = { open: "default", upcoming: "secondary", closed: "warning", unknown: "muted" } as const;

export default async function ScholarshipPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const loaded = await loadOrUnavailable(async () => ({ s: await getScholarshipById(id) }));
  if (!loaded) {
    return (
      <PageContainer>
        <UnavailableState />
      </PageContainer>
    );
  }
  // Missing, draft and archived scholarships are indistinguishable here: RLS hides all of them.
  const s = loaded.s;
  if (!s) notFound();

  const auth = await getAuthState();
  const today = todayIsoDate();
  const applyLink = linkView(s.officialApplicationUrl);
  const infoLink = linkView(s.officialInformationUrl);
  const phase = applicationPhase(s.openingDate, s.deadline, today);
  const verification = verificationState(s.lastVerifiedAt, today);
  const { general, pakistan } = splitRequirements(s.requirements);
  const sources = buildSources(s);

  const feeText =
    s.applicationFee === null
      ? null
      : s.applicationFee === 0
        ? "No application fee"
        : `${s.applicationFee} (currency not recorded; confirm on the official site)`;

  return (
    <PageContainer className="space-y-10">
      <div className="space-y-4">
        <nav aria-label="Scholarship navigation" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/scholarships" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> All scholarships
          </Link>
          <Link href="/matches" className="text-muted-foreground hover:text-foreground">
            My matches
          </Link>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <FundingBadge type={s.fundingType} />
          <Badge variant="outline">{s.degreeLevel}</Badge>
          {s.field ? <Badge variant="secondary">{s.field}</Badge> : null}
          <Badge variant={PHASE_VARIANT[phase.kind]}>{phase.label}</Badge>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{s.name}</h1>
        <p className="text-lg text-muted-foreground">
          {s.provider}
          {s.country ? (
            <>
              {" · "}
              <Link href={`/countries/${s.country.slug}`} className="underline-offset-4 hover:underline">
                {s.country.name}
              </Link>
            </>
          ) : null}
        </p>

        <VerificationNotice lastVerifiedAt={s.lastVerifiedAt} today={today} />

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {applyLink ? (
            <Button asChild size="lg">
              <a href={applyLink.href} target="_blank" rel="noopener noreferrer">
                Apply on Official Website <ExternalLink className="size-4" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Official application link not available.</p>
          )}
          {infoLink ? (
            <Button asChild size="lg" variant="outline">
              <a href={infoLink.href} target="_blank" rel="noopener noreferrer">
                Official information <ExternalLink className="size-4" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          ) : null}
        </div>
        {auth.isAuthenticated ? (
          <div className="pt-1">
            <StartApplicationButton scholarshipId={s.id} />
          </div>
        ) : null}
        <p className="max-w-2xl text-sm text-muted-foreground">
          {applyLink ? `Opens ${applyLink.host}. ` : ""}
          You apply on the official website. ScholarPath does not submit applications for you. Confirm every detail
          there before you apply.
        </p>

        <nav aria-label="On this page" className="flex flex-wrap gap-2 pt-1 text-sm">
          {[
            ["#funding", "Funding"],
            ["#eligibility", "Eligibility"],
            ["#requirements", "Requirements"],
            ["#pakistan-side", "Pakistan-side"],
            ["#dates", "Dates"],
            ["#assistant", "Ask a question"],
            ["#sources", "Sources"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-md border px-2.5 py-1 text-muted-foreground hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-10">
          <Section id="funding" title="Funding">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{FUNDING_LABELS[s.fundingType]}.</strong>{" "}
              {FUNDING_EXPLANATIONS[s.fundingType]}
            </p>
            <dl className="rounded-xl border px-4">
              <Fact label="Tuition" value={s.tuitionCoverage} />
              <Fact label="Stipend" value={s.stipendDetails} />
              <Fact label="Accommodation" value={s.accommodationDetails} />
              <Fact label="Insurance" value={s.insuranceDetails} />
              <Fact label="Travel support" value={s.travelDetails} />
              <Fact label="Application fee" value={feeText} />
            </dl>
          </Section>

          <Section id="eligibility" title="Eligibility">
            <dl className="rounded-xl border px-4">
              <Fact label="Summary" value={s.eligibilitySummary} />
              <Fact label="Minimum GPA" value={formatGpa(s.minimumGpa, s.minimumGpaScale)} />
              <Fact label="English requirement" value={s.englishRequirementSummary} />
            </dl>
          </Section>

          <Section
            id="requirements"
            title="Requirements and documents"
            description="As recorded from the sources listed on this page. Confirm them on the official website."
          >
            {general.length === 0 ? (
              <p className="text-sm text-muted-foreground">{NOT_AVAILABLE}</p>
            ) : (
              <div className="space-y-6">
                {general.map((g) => (
                  <div key={g.key} className="space-y-2">
                    <h3 className="text-sm font-semibold">{g.label}</h3>
                    <RequirementList items={g.items} sources={sources.byId} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            id="pakistan-side"
            title="For applicants in Pakistan"
            description="Steps for applicants in Pakistan depend on the scholarship and the university. Only steps recorded for this scholarship are shown."
          >
            {pakistan.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No Pakistan-specific steps have been recorded for this scholarship yet. Check the official application
                instructions for anything that applies to applicants from Pakistan.
              </p>
            ) : (
              <RequirementList items={pakistan} sources={sources.byId} flagMissingSource />
            )}
          </Section>

          <Section
            id="assistant"
            title="Ask about this scholarship"
            description="Answers come only from the sources recorded for this scholarship, with the sources shown."
          >
            <AssistantPanel scholarshipId={s.id} isAuthenticated={auth.isAuthenticated} />
          </Section>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-6 lg:self-start">
          <Section id="dates" title="Key dates">
            <dl className="rounded-xl border px-4">
              <Fact label="Status" value={phase.kind === "unknown" ? null : phase.label} />
              <Fact label="Opens" value={formatDate(s.openingDate)} />
              <Fact label="Deadline" value={formatDate(s.deadline)} />
              <Fact label="Last verified" value={verification.dateText} />
              <Fact label="University" value={s.university?.name ?? null} />
            </dl>
            <p className="text-xs text-muted-foreground">
              Dates are shown as recorded. Times and time zones are not stored, so check the exact cut-off on the
              official website.
            </p>
          </Section>

          <Section id="sources" title="Sources">
            <SourcesSection view={sources} />
          </Section>
        </aside>
      </div>
    </PageContainer>
  );
}
