"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import type { AdminFormState } from "@/lib/admin-scholarships/types";

type Action = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;

/**
 * Two-step button for state-changing admin actions (publish, archive, delete, verify...).
 * The first click only asks for confirmation; submission is disabled while pending (no double submit).
 * Only the listed hidden fields are sent; the server re-validates and re-authorizes everything.
 */
export function ConfirmActionButton({
  action, fields, label, confirmText, confirmLabel, variant = "outline", noConfirm = false,
}: {
  action: Action; fields: Record<string, string>; label: string; confirmText: string; confirmLabel?: string;
  variant?: "outline" | "destructive" | "default" | "ghost"; noConfirm?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, {});
  const hidden = Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  if (noConfirm || confirming) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2" aria-label={label}>
        {hidden}
        {!noConfirm ? <span className="text-sm">{confirmText}</span> : null}
        <Button type="submit" size="sm" variant={noConfirm ? variant : variant === "outline" ? "default" : variant} disabled={pending}>
          {pending ? "Working…" : noConfirm ? label : (confirmLabel ?? "Yes, continue")}
        </Button>
        {!noConfirm ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
        ) : null}
        <FormMessage error={state.error} success={state.success} />
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant={variant} onClick={() => setConfirming(true)}>{label}</Button>
      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}
