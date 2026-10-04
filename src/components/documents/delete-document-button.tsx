"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { deleteDocument } from "@/lib/documents/actions";
import type { DocumentFormState } from "@/lib/documents/types";

/** Two-step delete (same pattern as Module 05). The only field sent is the record id; ownership is re-checked on the server. */
export function DeleteDocumentButton({ id, label }: { id: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<DocumentFormState, FormData>(deleteDocument, {});

  if (!confirming) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Delete ${label}`}>
          Delete
        </Button>
        <FormMessage error={state.error} />
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" role="group" aria-label={`Confirm deleting ${label}`}>
      <input type="hidden" name="id" value={id} />
      <span className="text-sm">Delete this document permanently?</span>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <FormMessage error={state.error} />
    </form>
  );
}
