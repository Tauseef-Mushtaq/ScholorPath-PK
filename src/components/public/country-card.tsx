import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { CountrySummary } from "@/lib/public/types";

export function CountryCard({ country }: { country: CountrySummary }) {
  const n = country.scholarshipCount;
  return (
    <Link
      href={`/countries/${country.slug}`}
      className="group flex items-center justify-between gap-4 rounded-xl border bg-card p-5 transition-colors outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="space-y-1">
        <span className="block text-base font-semibold">{country.name}</span>
        <span className="block text-sm text-muted-foreground">
          {n === 0 ? "No scholarships added yet" : `${n} ${n === 1 ? "scholarship" : "scholarships"}`}
          {country.region ? ` · ${country.region}` : ""}
        </span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden
      />
    </Link>
  );
}
