"use client";

import { useActionState } from "react";

import { requestPasswordReset } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/types";

import { FormField } from "./form-field";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage error={state.error ?? notice} success={state.success} />
      <FormField id="email" name="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
