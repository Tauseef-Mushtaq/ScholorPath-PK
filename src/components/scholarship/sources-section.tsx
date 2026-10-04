import { NOT_AVAILABLE } from "@/lib/public/format";
import type { SourcesView } from "@/lib/public/detail";

import { ExternalLinkText } from "./detail-parts";

/** Official links stored on the scholarship, then source rows exactly as recorded (type never upgraded). */
export function SourcesSection({ view }: { view: SourcesView }) {
  const empty = view.official.length === 0 && view.recorded.length === 0;
  return (
    <div className="space-y-5 text-sm">
      {empty ? <p className="text-muted-foreground">{NOT_AVAILABLE}</p> : null}

      {view.official.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-semibold">Official links</h3>
          <ul className="space-y-3">
            {view.official.map((o) => (
              <li key={`${o.label}-${o.link.href}`} className="space-y-0.5">
                <ExternalLinkText href={o.link.href}>{o.label}</ExternalLinkText>
                <p className="text-xs text-muted-foreground">{o.link.host}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.recorded.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-semibold">Recorded sources</h3>
          <ul className="space-y-3">
            {view.recorded.map((s) => (
              <li key={s.id} className="space-y-0.5">
                <ExternalLinkText href={s.link.href}>{s.name}</ExternalLinkText>
                <p className="text-xs text-muted-foreground">
                  {s.typeLabel} · {s.link.host} · {s.verifiedText ? `verified ${s.verifiedText}` : "not verified"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Source types are shown exactly as recorded. Official provider, university and government sources are the
        authority; always confirm details on the official website.
      </p>
    </div>
  );
}
