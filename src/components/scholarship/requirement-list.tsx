import { Badge } from "@/components/ui/badge";
import { sourceFor, type SourceView } from "@/lib/public/detail";
import type { ScholarshipRequirement } from "@/lib/public/types";

import { ExternalLinkText } from "./detail-parts";

/**
 * Requirement rows exactly as recorded. When a row points to a (public) source, that source is shown
 * with its host. `flagMissingSource` marks rows with no recorded source as unconfirmed.
 */
export function RequirementList({
  items,
  sources,
  flagMissingSource = false,
}: {
  items: ScholarshipRequirement[];
  sources: Map<string, SourceView>;
  flagMissingSource?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {items.map((r) => {
        const source = sourceFor(r, sources);
        return (
          <li key={r.id} className="rounded-lg border px-4 py-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {r.title}
              <Badge variant={r.required ? "default" : "muted"}>{r.required ? "Required" : "Optional"}</Badge>
            </p>
            {r.description ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{r.description}</p> : null}
            {source ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Source:{" "}
                <ExternalLinkText href={source.link.href}>
                  {source.name} ({source.link.host})
                </ExternalLinkText>
              </p>
            ) : flagMissingSource ? (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                No source recorded for this step. Treat it as unconfirmed and check the official instructions.
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
