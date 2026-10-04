import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { CountryCard } from "@/components/public/country-card";
import { PageHeader } from "@/components/public/page-header";
import { EmptyState, UnavailableState } from "@/components/public/states";
import { getCountries, loadOrUnavailable } from "@/lib/public/queries";

export const metadata: Metadata = {
  title: "Study destinations",
  description:
    "Explore countries offering international scholarships for Pakistani students and see which scholarships are listed for each destination.",
};

export default async function CountriesPage() {
  const countries = await loadOrUnavailable(() => getCountries());

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Study destinations"
        description="Choose a country to see the scholarships and universities listed for it."
      />
      {!countries ? (
        <UnavailableState />
      ) : countries.length === 0 ? (
        <EmptyState
          title="No countries have been added yet"
          description="Destinations will appear here once scholarships are published."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c) => (
            <li key={c.id}>
              <CountryCard country={c} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
