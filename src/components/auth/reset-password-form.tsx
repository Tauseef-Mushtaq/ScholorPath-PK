"use client";

import { useActionState } from "react";

import { updatePassword } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/types";
import { PASSWORD_MIN } from "@/lib/auth/validation";

import { FormField } from "./form-field";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function ResetPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage error={state.error} />
      <FormField id="password" name="password" label="New password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} error={state.fieldErrors?.password} />
      <FormField id="confirmPassword" name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" error={state.fieldErrors?.confirmPassword} />
      <SubmitButton pendingText="Updating…">Update password</SubmitButton>
    </form>
  );
}
