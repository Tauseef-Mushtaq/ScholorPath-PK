"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { SaveButton } from "@/components/profile/form-buttons";
import { Label } from "@/components/ui/label";
import { importScholarships } from "@/lib/admin-scholarships/actions";
import type { AdminFormState } from "@/lib/admin-scholarships/types";

export function ImportForm() {
  const [state, formAction] = useActionState<AdminFormState, FormData>(importScholarships, {});
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage error={state.error} success={state.success} />
      <div className="space-y-2">
        <Label htmlFor="json">Records (JSON array)</Label>
        <textarea id="json" name="json" rows={14} required defaultValue={state.values?.json ?? ""}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <SaveButton pendingText="Importing…">Import as drafts</SaveButton>
    </form>
  );
}
