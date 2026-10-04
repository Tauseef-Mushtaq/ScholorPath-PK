"use client";

import { useActionState } from "react";

import { signUp } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/types";
import { PASSWORD_MIN } from "@/lib/auth/validation";

import { FormField } from "./form-field";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function SignupForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(signUp, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage error={state.error} success={state.success} />
      <FormField id="email" name="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <FormField id="password" name="password" label="Password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} error={state.fieldErrors?.password} />
      <FormField id="confirmPassword" name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" error={state.fieldErrors?.confirmPassword} />
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
