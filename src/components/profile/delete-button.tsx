"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import type { ProfileFormState } from "@/lib/profile/types";

type DeleteAction = (prev: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;

/** Two-step delete: the first click only asks for confirmation. The only field sent is the record id. */
export function DeleteButton({ id, action, label }: { id: string; action: DeleteAction; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(action, {});

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Delete ${label}`}>
        Delete
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" role="group" aria-label={`Confirm deleting ${label}`}>
      <input type="hidden" name="id" value={id} />
      <span className="text-sm">Delete this permanently?</span>
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
