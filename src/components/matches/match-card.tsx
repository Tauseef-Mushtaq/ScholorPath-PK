import Link from "next/link";
import { CheckCircle2, CircleHelp, Info, XCircle } from "lucide-react";

import { ScholarshipCard } from "@/components/public/scholarship-card";
import { Badge } from "@/components/ui/badge";
import { explainResult } from "@/lib/matching";
import type { Check, MatchDecision, MatchResult } from "@/lib/matching";
import type { ScholarshipListItem } from "@/lib/public/types";

const DECISION_VARIANT: Record<MatchDecision, "default" | "warning" | "muted" | "secondary"> = {
  eligible: "default",
  needs_information: "warning",
  unknown: "muted",
  not_eligible: "secondary",
};

function toListItem(r: MatchResult): ScholarshipListItem {
  const s = r.scholarship;
  return {
    id: s.id,
    name: s.name,
    provider: s.provider,
    degreeLevel: s.degreeLevel,
    field: s.field,
    fundingType: s.fundingType,
    deadline: s.deadline,
    country: s.country,
    university: s.university,
  };
}

function CheckList({ title, icon: Icon, checks, tone }: { title: string; icon: typeof Info; checks: Check[]; tone: string }) {
  if (checks.length === 0) return null;
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className={`size-4 ${tone}`} aria-hidden />
        {title}
      </h4>
      <ul className="mt-1 space-y-1 pl-5 text-sm text-muted-foreground">
        {checks.map((c, i) => (
          <li key={`${c.key}-${i}`} className="list-disc">
            <span className="font-medium text-foreground">{c.label}:</span> {c.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One scholarship + the reasons behind its eligibility status. Reuses the public ScholarshipCard
 * (the whole card links to /scholarships/[id]); explanations sit below so their links stay clickable.
 */
export function MatchCard({ result }: { result: MatchResult }) {
  const x = explainResult(result);
  return (
    <li className="flex flex-col rounded-xl border bg-card">
      <div className="p-2 pb-0">
        <ScholarshipCard scholarship={toListItem(result)} />
      </div>
      <div className="space-y-3 p-5 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={DECISION_VARIANT[x.decision]} data-decision={x.decision}>
            {x.decisionLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">{x.summary}</span>
          {result.availability === "closed" ? <Badge variant="outline">Deadline passed</Badge> : null}
          {result.availability === "unknown" ? <Badge variant="outline">Deadline not listed — check the official site</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">{x.decisionDescription}</p>
        <CheckList title="Why it matched" icon={CheckCircle2} checks={x.matched} tone="text-emerald-600" />
        <CheckList title="Does not match your profile" icon={XCircle} checks={x.notMet} tone="text-destructive" />
        <CheckList title="Needs your confirmation" icon={CircleHelp} checks={x.toConfirm} tone="text-amber-600" />
        <CheckList title="For your information (not checked)" icon={Info} checks={x.info} tone="text-muted-foreground" />
        {x.missing.length ? (
          <p className="text-sm">
            <span className="font-medium">Add to your profile: </span>
            {x.missing.map((m, i) => (
              <span key={m.what}>
                {i ? ", " : ""}
                <Link href={m.href} className="underline underline-offset-2">
                  {m.what}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
}
