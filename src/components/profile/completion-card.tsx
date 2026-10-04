import { CheckCircle2, Circle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { computeCompletion } from "@/lib/profile/completion";

export function CompletionCard({ completion }: { completion: ReturnType<typeof computeCompletion> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Profile completeness: {completion.percent}%</CardTitle>
        <CardDescription>
          {completion.complete
            ? "Your profile has what scholarship matching needs. Keep it up to date."
            : "Finish these items so scholarship matching can use your profile."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="progressbar"
          aria-label="Profile completeness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completion.percent}
          className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div className="h-full bg-primary" style={{ width: `${completion.percent}%` }} />
        </div>
        <ul className="space-y-1.5 text-sm">
          {completion.items.map((i) => (
            <li key={i.key} className="flex items-start gap-2">
              {i.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Done" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="To do" />
              )}
              <span>
                {i.label}
                {!i.done ? <span className="block text-xs text-muted-foreground">{i.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
