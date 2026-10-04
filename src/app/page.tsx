import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Compass,
  FileText,
  ListChecks,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";

import { CountryCard } from "@/components/public/country-card";
import { getAuthState } from "@/lib/auth/session";
import { EmptyState } from "@/components/public/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config/site";
import { FUNDING_EXPLANATIONS, FUNDING_LABELS } from "@/lib/public/format";
import { getCountries, loadSoft } from "@/lib/public/queries";
import type { FundingType } from "@/lib/public/types";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — Find the right scholarship. Prepare with confidence.` },
  description:
    "ScholarPath helps Pakistani students discover international scholarships, understand official requirements, prepare applications and stay organised from first search to final submission.",
};

const journey = [
  { icon: Compass, title: "Discover", text: "Browse scholarships by country, degree, field and funding." },
  { icon: ListChecks, title: "Check eligibility", text: "See the official requirements and decide if it fits you." },
  { icon: FileText, title: "Prepare", text: "Gather documents and work on your essays and statements." },
  { icon: Send, title: "Apply", text: "Submit on the official portal. You always press the button." },
  { icon: ClipboardList, title: "Track", text: "Keep deadlines and tasks for every application in one place." },
] as const;

const fundingTypes: FundingType[] = ["fully_funded", "partially_funded", "not_funded"];

export default async function HomePage() {
  // Decorative section: if the database is unreachable the landing page still renders.
  const auth = await getAuthState();
  const countries = await loadSoft(() => getCountries(8));

  return (
    <>
      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Find the right scholarship. Prepare with confidence.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              ScholarPath helps Pakistani students discover international scholarships, understand the
              official requirements, prepare their applications and stay organised along the way.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/scholarships">Explore scholarships</Link>
              </Button>
              {auth.isAuthenticated ? (
                <Button asChild size="lg" variant="outline">
                  <Link href="/dashboard">Go to dashboard</Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="outline">
                  <Link href="/signup">Create free account</Link>
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Free to use. Every scholarship links to its official source.
            </p>
          </div>

          {/* Illustrative preview of the journey. Not real scholarship data. */}
          <figure aria-label="Illustration of an application journey" className="rounded-xl border bg-card p-6">
            <ol className="relative space-y-5">
              <span aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-border" />
              {journey.map((step, i) => (
                <li key={step.title} className="relative flex items-start gap-4">
                  <span
                    aria-hidden
                    className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full border ${
                      i === 1 ? "border-primary bg-primary text-primary-foreground" : "bg-background"
                    }`}
                  >
                    <step.icon className="size-4" />
                  </span>
                  <div className="pt-1">
                    <p className="text-sm font-semibold">{step.title}</p>
                    {i === 1 ? (
                      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                        <li>Degree level matches</li>
                        <li>Language test requirement noted</li>
                        <li>Documents checklist ready</li>
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            <figcaption className="mt-5 border-t pt-3 text-xs text-muted-foreground">
              Illustrative example of how ScholarPath organises your journey.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-4 border-b">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How ScholarPath works</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            One clear path from your first search to a submitted application.
          </p>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {journey.map((step, i) => (
              <li key={step.title} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
                    <step.icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-xs text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Discovery */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Search the way students actually decide</h2>
            <p className="text-muted-foreground">
              Narrow scholarships by what matters to you, then open each one to read its requirements,
              dates and official links.
            </p>
            <Button asChild>
              <Link href="/scholarships">
                Explore Scholarships <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Ways to filter scholarships">
            {["Country", "Degree", "Field", "Funding", "Deadline", "Requirements"].map((f) => (
              <li key={f}>
                <Badge variant="outline" className="px-3 py-1.5 text-sm">
                  {f}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Funding */}
      <section className="border-b">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Understand what &ldquo;funded&rdquo; really means</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Funding labels are a starting point. Always read the funding details on the scholarship page.
          </p>
          <dl className="mt-8 grid gap-6 md:grid-cols-3">
            {fundingTypes.map((type) => (
              <div key={type} className="space-y-2 border-l-2 border-primary/40 pl-4">
                <dt className="font-semibold">{FUNDING_LABELS[type]}</dt>
                <dd className="text-sm text-muted-foreground">{FUNDING_EXPLANATIONS[type]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Countries */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Browse by country</h2>
              <p className="mt-2 text-muted-foreground">See which destinations have scholarships listed.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/countries">All countries</Link>
            </Button>
          </div>
          <div className="mt-8">
            {countries && countries.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {countries.map((c) => (
                  <li key={c.id}>
                    <CountryCard country={c} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Countries are being added"
                description="Destination countries will appear here as soon as scholarships are published."
              />
            )}
          </div>
        </div>
      </section>

      {/* AI assistance */}
      <section className="border-b">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">AI support, with you in control</h2>
            <p className="text-muted-foreground">
              As ScholarPath grows, AI will help you work through the application. It supports your
              preparation; it never applies for you.
            </p>
            <p className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                You review every suggestion and submit on the official portal yourself. Nothing is sent
                without you.
              </span>
            </p>
          </div>
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              "Understand requirements in plain language",
              "Organise tasks and deadlines",
              "Prepare application materials",
              "Improve your SOP",
              "Work on essays",
              "Spot missing requirements",
            ].map((item) => (
              <li key={item} className="rounded-lg border bg-card px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Mentors */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-14">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Learn from Pakistani scholars</h2>
            <p className="text-muted-foreground">
              Hear from Pakistani students who have been through scholarship applications. Their stories
              are personal experience and are always kept separate from official requirements.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/mentors">
              <Users className="size-4" aria-hidden /> Meet the mentor community
            </Link>
          </Button>
        </div>
      </section>

      {/* Final CTA */}
      <section>
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            Start with the scholarships. Sign up when you want to keep track.
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/scholarships">Explore scholarships</Link>
            </Button>
            {auth.isAuthenticated ? null : (
              <Button asChild size="lg" variant="outline">
                <Link href="/signup">Create free account</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
