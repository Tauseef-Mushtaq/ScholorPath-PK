import { Download, Eye, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentRow } from "@/lib/documents/types";
import { documentTypeLabel, formatFileSize, formatFormatLabel } from "@/lib/documents/validation";

import { DeleteDocumentButton } from "./delete-document-button";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Server-rendered (works without client JS except the delete confirmation). View/Download are plain links
 * to the authenticated route; a short-lived signed URL is created only when one is clicked. Plain <a>, not
 * <Link>, so nothing is prefetched.
 */
export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-card" aria-label="Your documents">
      {documents.map((d) => {
        const created = new Date(d.created_at);
        return (
          <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="break-words font-medium">{d.file_name}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="muted">{documentTypeLabel(d.document_type)}</Badge>
                  <span>{formatFormatLabel(d.mime_type)}</span>
                  <span aria-hidden>·</span>
                  <span>{formatFileSize(d.file_size)}</span>
                  <span aria-hidden>·</span>
                  <span>Uploaded {Number.isNaN(created.getTime()) ? "" : dateFormat.format(created)}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button asChild variant="outline" size="sm">
                <a href={`/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer" aria-label={`View ${d.file_name}`}>
                  <Eye className="size-4" aria-hidden /> View
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/documents/${d.id}/file?download=1`} aria-label={`Download ${d.file_name}`}>
                  <Download className="size-4" aria-hidden /> Download
                </a>
              </Button>
              <DeleteDocumentButton id={d.id} label={d.file_name} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
