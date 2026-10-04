import Link from "next/link";
import { Building2, CalendarDays, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { deadlineState, formatDate } from "@/lib/public/format";
import type { ScholarshipListItem } from "@/lib/public/types";

import { FundingBadge } from "./funding-badge";

export function ScholarshipCard({ scholarship: s }: { scholarship: ScholarshipListItem }) {
  const state = deadlineState(s.deadline);
  const deadline = formatDate(s.deadline);

  return (
    <article className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border bg-card p-5 transition-colors focus-within:border-primary hover:border-primary/60">
      {/* Badges stay inside the card: wrap when needed; long field text wraps instead of overflowing. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FundingBadge type={s.fundingType} />
        <Badge variant="outline" className="max-w-full shrink truncate">
          {s.degreeLevel}
        </Badge>
        {s.field ? (
          <Badge
            variant="secondary"
            className="max-w-full min-w-0 whitespace-normal break-words text-left leading-snug"
            title={s.field}
          >
            {s.field}
          </Badge>
        ) : null}
      </div>

      <div className="min-w-0 space-y-1">
        <h3 className="text-base leading-snug font-semibold">
          {/* The stretched link makes the whole card clickable with one real, focusable link. */}
          <Link
            href={`/scholarships/${s.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {s.name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">{s.provider}</p>
      </div>

      <dl className="mt-auto space-y-1.5 text-sm text-muted-foreground">
        {s.country ? (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Country</dt>
            <MapPin className="size-4 shrink-0" aria-hidden />
            <dd className="min-w-0 truncate">{s.country.name}</dd>
          </div>
        ) : null}
        {s.university ? (
          <div className="flex items-center gap-2">
            <dt className="sr-only">University</dt>
            <Building2 className="size-4 shrink-0" aria-hidden />
            <dd className="min-w-0 truncate">{s.university.name}</dd>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <dt className="sr-only">Deadline</dt>
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          <dd>
            {deadline ? (
              <>
                {state === "closed" ? "Closed " : "Deadline "}
                {deadline}
              </>
            ) : (
              "Deadline not listed"
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}
