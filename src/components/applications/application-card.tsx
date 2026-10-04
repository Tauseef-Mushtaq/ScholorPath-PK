import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { applicationStatusLabel } from "@/lib/applications/constants";
import { deadlineLabel, formatDate } from "@/lib/applications/format";
import type { ApplicationListItem } from "@/lib/applications/types";

export function ApplicationCard({ item, todayIso }: { item: ApplicationListItem; todayIso: string }) {
  const { scholarship: s, taskCounts } = item;
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-lg">
            <Link href={`/applications/${item.id}`} className="hover:underline">
              {s.name}
            </Link>
          </CardTitle>
          <Badge variant="secondary">{applicationStatusLabel(item.status)}</Badge>
        </div>
        <CardDescription>
          {s.provider}
          {s.countryName ? ` · ${s.countryName}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{deadlineLabel(s.deadline, todayIso)}</p>
        <p>
          Tasks: {taskCounts.done}/{taskCounts.total} done
          {taskCounts.todo > 0 ? ` · ${taskCounts.todo} open` : ""}
        </p>
        <p className="text-xs">Updated {formatDate(item.updatedAt)}</p>
        <Link href={`/applications/${item.id}`} className="text-sm font-medium text-primary hover:underline">
          Open workspace
        </Link>
      </CardContent>
    </Card>
  );
}
