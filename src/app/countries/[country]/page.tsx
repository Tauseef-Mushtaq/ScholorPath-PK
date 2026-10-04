import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/public/page-header";
import { ScholarshipCard } from "@/components/public/scholarship-card";
import { EmptyState, UnavailableState } from "@/components/public/states";
import { Button } from "@/components/ui/button";
import { isSlug, safeExternalUrl } from "@/lib/public/format";
import { getCountryBySlug, getCountryScholarships, loadOrUnavailable } from "@/lib/public/queries";

type Props = { params: Promise<{ country: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: slug } = await params;
  if (!isSlug(slug)) return { title: "Country not found" };

  const country = await loadOrUnavailable(() => getCountryBySlug(slug)).catch(() => null);
  if (!country) return { title: "Study destination" };
  return {
    title: `Scholarships in ${country.name}`,
    description: `Scholarships and universities listed for ${country.name} on ScholarPath PK. Check official requirements and deadlines before you apply.`,
    alternates: { canonical: `/countries/${country.slug}` },
  };
}

export default async function CountryPage({ params }: Props) {
  const { country: slug } = await params;
  if (!isSlug(slug)) notFound();

  // null => Supabase unavailable; { country: null } => no such country (404).
  const loaded = await loadOrUnavailable(async () => {
    const country = await getCountryBySlug(slug);
    if (!country) return { country: null, scholarships: [] };
    return { country, scholarships: await getCountryScholarships(country.id) };
  });

  if (!loaded) {
    return (
      <PageContainer>
        <UnavailableState />
      </PageContainer>
    );
  }
  const { country, scholarships } = loaded;
  if (!country) notFound();

  return (
    <PageContainer className="space-y-10">
      <div className="space-y-4">
        <Link
          href="/countries"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> All countries
        </Link>
        <PageHeader
          title={country.name}
          description={country.region ? `Region: ${country.region}` : undefined}
        />
      </div>

      <section aria-labelledby="country-scholarships" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="country-scholarships" className="text-xl font-semibold tracking-tight">
            Scholarships
          </h2>
          <Button asChild variant="outline" size="sm">
            <Link href={`/scholarships?country=${country.slug}`}>Explore scholarships with filters</Link>
          </Button>
        </div>
        {scholarships.length === 0 ? (
          <EmptyState
            title="No scholarships have been added for this country yet"
            description="Check back soon, or browse scholarships for other destinations."
            action={{ href: "/scholarships", label: "Browse all scholarships" }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scholarships.map((s) => (
              <li key={s.id}>
                <ScholarshipCard scholarship={s} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="country-universities" className="space-y-4">
        <h2 id="country-universities" className="text-xl font-semibold tracking-tight">
          Universities
        </h2>
        {country.universities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No universities have been added for this country yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {country.universities.map((u) => {
              const href = safeExternalUrl(u.website);
              return (
                <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
                  <span className="font-medium">{u.name}</span>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-primary underline-offset-4 hover:underline"
                    >
                      Website <ExternalLink className="size-3.5" aria-hidden />
                      <span className="sr-only">
                        of {u.name} (opens in a new tab)
                      </span>
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
