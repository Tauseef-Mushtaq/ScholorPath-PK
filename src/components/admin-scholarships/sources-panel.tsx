"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { SaveButton } from "@/components/profile/form-buttons";
import { TextField } from "@/components/profile/fields";
import { Badge } from "@/components/ui/badge";
import { deleteSource, markSourceVerified, saveSource } from "@/lib/admin-scholarships/actions";
import type { AdminFormState, AdminSource } from "@/lib/admin-scholarships/types";
import { LIMITS } from "@/lib/admin-scholarships/validation";
import { formatDate } from "@/lib/public/format";

import { ConfirmActionButton } from "./confirm-action-button";

function SourceForm({ scholarshipId, source }: { scholarshipId: string; source?: AdminSource }) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(saveSource, {});
  const key = source?.id ?? "new";
  const v = (k: string, fallback: string) => state.values?.[k] ?? fallback;
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <input type="hidden" name="scholarship_id" value={scholarshipId} />
      {source ? <input type="hidden" name="id" value={source.id} /> : null}
      <FormMessage error={state.error} success={state.success} />
      <TextField id={`src-url-${key}`} name="source_url" label="Source URL" required maxLength={LIMITS.url}
        defaultValue={v("source_url", source?.sourceUrl ?? "")} error={err("source_url")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField id={`src-name-${key}`} name="source_name" label="Source name" maxLength={LIMITS.sourceName} defaultValue={v("source_name", source?.sourceName ?? "")} error={err("source_name")} />
        <TextField id={`src-type-${key}`} name="source_type" label="Source type" maxLength={LIMITS.sourceType} defaultValue={v("source_type", source?.sourceType ?? "")} error={err("source_type")} />
        <TextField id={`src-prio-${key}`} name="priority" label="Priority" inputMode="text" defaultValue={v("priority", String(source?.priority ?? 1))} error={err("priority")} hint="Lower number = higher trust (1 = official provider)." />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={source ? source.active : true} className="size-4" />
        Active (shown publicly while the scholarship is published)
      </label>
      <SaveButton>{source ? "Save source" : "Add source"}</SaveButton>
    </form>
  );
}

export function SourcesPanel({ scholarshipId, sources }: { scholarshipId: string; sources: AdminSource[] }) {
  return (
    <div className="space-y-4">
      {sources.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No sources recorded yet. Add the official page this scholarship&apos;s details came from.
        </p>
      ) : (
        <ul className="space-y-3">
          {sources.map((s) => (
            <li key={s.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all text-sm font-medium">{s.sourceName ?? s.sourceUrl}</span>
                <Badge variant={s.active ? "default" : "muted"}>{s.active ? "Active" : "Inactive"}</Badge>
                <Badge variant="outline">Priority {s.priority}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {s.lastVerifiedAt ? `Last verified ${formatDate(s.lastVerifiedAt)}` : "Never verified"}
              </p>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Edit source</summary>
                <div className="mt-3"><SourceForm scholarshipId={scholarshipId} source={s} /></div>
              </details>
              <div className="flex flex-wrap gap-3">
                <ConfirmActionButton action={markSourceVerified} fields={{ id: s.id, scholarship_id: scholarshipId }}
                  label="Mark verified now" confirmText="Confirm you checked this source today?" confirmLabel="Yes, I checked it" />
                <ConfirmActionButton action={deleteSource} fields={{ id: s.id, scholarship_id: scholarshipId }}
                  label="Delete source" confirmText="Delete this source permanently?" confirmLabel="Yes, delete" variant="destructive" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Add a source</summary>
        <div className="mt-3"><SourceForm scholarshipId={scholarshipId} /></div>
      </details>
    </div>
  );
}
