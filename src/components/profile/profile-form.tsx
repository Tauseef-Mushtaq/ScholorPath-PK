"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfile } from "@/lib/profile/actions";
import type { ProfileFormState, ProfileRow } from "@/lib/profile/types";
import { LIMITS } from "@/lib/profile/validation";

import { TextField } from "./fields";
import { SaveButton } from "./form-buttons";

export function ProfileForm({ profile }: { profile: ProfileRow }) {
  // The Server Action is passed to useActionState directly, so the form also works as a plain
  // HTML form POST (progressive enhancement). The form closes when a NEW state with `success`
  // arrives; `editBase` remembers the state that was current when editing started.
  const [initial] = useState<ProfileFormState>(() => ({}));
  const [state, formAction] = useActionState<ProfileFormState, FormData>(updateProfile, initial);
  const [editBase, setEditBase] = useState<ProfileFormState | null>(profile.full_name ? null : initial);
  const editing = editBase !== null && !(state.success && state !== editBase);
  const saved = !editing ? state.success : undefined;

  const v = state.values;
  const rows: [string, string | null][] = [
    ["Full name", profile.full_name],
    ["Nationality", profile.nationality],
    ["City", profile.city],
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Personal information</CardTitle>
          <CardDescription>Used to check scholarship eligibility. We only ask for what matching needs.</CardDescription>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditBase(state)}>
            Edit
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <>
            <FormMessage success={saved} />
            <dl className="mt-2 grid gap-3 sm:grid-cols-3">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="text-sm">{value || <span className="text-muted-foreground">Not added yet</span>}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <form action={formAction} className="space-y-4" noValidate>
            <FormMessage error={state.error} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField id="full_name" name="full_name" label="Full name" required maxLength={LIMITS.fullName} autoComplete="name" defaultValue={v?.full_name ?? profile.full_name ?? ""} error={state.fieldErrors?.full_name} />
              <TextField id="nationality" name="nationality" label="Nationality" maxLength={LIMITS.nationality} defaultValue={v?.nationality ?? profile.nationality ?? ""} error={state.fieldErrors?.nationality} />
              <TextField id="city" name="city" label="City" maxLength={LIMITS.city} autoComplete="address-level2" defaultValue={v?.city ?? profile.city ?? ""} error={state.fieldErrors?.city} />
            </div>
            <div className="flex gap-2">
              <SaveButton>Save profile</SaveButton>
              {profile.full_name ? (
                <Button type="button" variant="outline" onClick={() => setEditBase(null)}>Cancel</Button>
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
