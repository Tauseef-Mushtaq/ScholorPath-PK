import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryLabel, type ApplicationHealth, type ReviewItem } from "@/lib/review";

function severityBadge(severity: ReviewItem["severity"]) {
  switch (severity) {
    case "blocker":
      return <Badge variant="destructive">Blocker</Badge>;
    case "warn":
      return (
        <Badge variant="secondary" className="border-amber-500/40 text-amber-800 dark:text-amber-200">
          Warning
        </Badge>
      );
    case "ok":
      return (
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-800 dark:text-emerald-200">
          OK
        </Badge>
      );
    default:
      return <Badge variant="outline">Info</Badge>;
  }
}

function overallLabel(overall: ApplicationHealth["overall"]) {
  if (overall === "ready") return "Ready to apply externally";
  if (overall === "not_ready") return "Not ready";
  return "Needs work";
}

function overallClass(overall: ApplicationHealth["overall"]) {
  if (overall === "ready") return "text-emerald-700 dark:text-emerald-300";
  if (overall === "not_ready") return "text-destructive";
  return "text-amber-800 dark:text-amber-200";
}

const ORDER: ReviewItem["category"][] = [
  "eligibility",
  "deadline",
  "profile",
  "documents",
  "writing",
  "tasks",
  "consistency",
];

export function ReviewPanel({ health }: { health: ApplicationHealth }) {
  const grouped = new Map<string, ReviewItem[]>();
  for (const cat of ORDER) grouped.set(cat, []);
  for (const item of health.items) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Application review</CardTitle>
            <CardDescription>
              Completeness, consistency heuristics, eligibility, and deadline status. ScholarPath does not submit
              applications for you.
            </CardDescription>
          </div>
          <div className="text-right">
            <p className={`text-lg font-semibold ${overallClass(health.overall)}`}>{overallLabel(health.overall)}</p>
            <p className="text-sm text-muted-foreground">Health score {health.score}/100</p>
          </div>
        </div>
        <p className="pt-2 text-sm text-muted-foreground">{health.summary}</p>
        <div className="flex flex-wrap gap-2 pt-2 text-xs text-muted-foreground">
          <span>{health.counts.blockers} blockers</span>
          <span>·</span>
          <span>{health.counts.warnings} warnings</span>
          <span>·</span>
          <span>{health.counts.ok} ok</span>
          <span>·</span>
          <span>{health.counts.info} info</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {ORDER.map((cat) => {
          const items = grouped.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={cat} aria-labelledby={`review-${cat}`}>
              <h3 id={`review-${cat}`} className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground">
                {categoryLabel(cat)}
              </h3>
              <ul className="space-y-2">
                {items.map((it) => (
                  <li key={it.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-sm">{it.title}</p>
                      {severityBadge(it.severity)}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{it.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
