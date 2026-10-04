"use client";

import Link from "next/link";
import { useActionState } from "react";

import { login } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/types";

import { FormField } from "./form-field";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage error={state.error ?? notice} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField id="email" name="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <FormField id="password" name="password" label="Password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} />
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}
