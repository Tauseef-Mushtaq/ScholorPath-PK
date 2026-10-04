"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { SaveButton } from "@/components/profile/form-buttons";
import { SelectField, TextAreaField, TextField } from "@/components/profile/fields";
import { Button } from "@/components/ui/button";
import type { AdminFormState, Option } from "@/lib/admin-scholarships/types";
import { DEGREE_LEVEL_SUGGESTIONS, LIMITS } from "@/lib/admin-scholarships/validation";
import Link from "next/link";

type Action = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;
type University = Option & { countryId: string };

const FUNDING_OPTIONS = [
  { value: "fully_funded", label: "Fully funded" },
  { value: "partially_funded", label: "Partially funded" },
  { value: "not_funded", label: "Admission only / not funded" },
] as const;

/** Create / edit form. All validation is repeated on the server; nothing here is trusted. */
export function ScholarshipForm({
  action, id, initial, countries, universities, submitLabel,
}: {
  action: Action; id?: string; initial: Record<string, string>;
  countries: Option[]; universities: University[]; submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<AdminFormState, FormData>(action, {});
  const v = (k: string) => state.values?.[k] ?? initial[k] ?? "";
  const err = (k: string) => state.fieldErrors?.[k];
  const [country, setCountry] = useState(initial.country_id ?? "");
  const unis = universities.filter((u) => u.countryId === country);

  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state.redirectTo, router]);

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <FormMessage error={state.error} success={state.success} />

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Basics</legend>
        <TextField id="name" name="name" label="Name" required maxLength={LIMITS.name} defaultValue={v("name")} error={err("name")} />
        <TextField id="provider" name="provider" label="Provider" required maxLength={LIMITS.provider} defaultValue={v("provider")} error={err("provider")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <SelectField id="country_id" name="country_id" label="Country" required options={countries} defaultValue={country}
              error={err("country_id")} />
            <CountryWatcher value={country} onChange={setCountry} />
          </div>
          <div key={country}>
            <SelectField id="university_id" name="university_id" label="University" options={unis}
              defaultValue={country === (initial.country_id ?? "") ? v("university_id") : ""}
              hint={country ? undefined : "Choose a country first."} error={err("university_id")} />
          </div>
          <div>
            <TextField id="degree_level" name="degree_level" label="Degree level" required maxLength={LIMITS.degreeLevel}
              defaultValue={v("degree_level")} error={err("degree_level")} hint="Use the same wording each time (public filters match exactly)." />
            <p className="text-xs text-muted-foreground">Common: {DEGREE_LEVEL_SUGGESTIONS.join(", ")}.</p>
          </div>
          <TextField id="field" name="field" label="Field" maxLength={LIMITS.field} defaultValue={v("field")} error={err("field")} />
          <SelectField id="funding_type" name="funding_type" label="Funding type" required options={FUNDING_OPTIONS}
            defaultValue={v("funding_type")} error={err("funding_type")} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Funding details</legend>
        <TextAreaField id="tuition_coverage" name="tuition_coverage" label="Tuition coverage" maxLength={LIMITS.longText} defaultValue={v("tuition_coverage")} error={err("tuition_coverage")} />
        <TextAreaField id="stipend_details" name="stipend_details" label="Stipend details" maxLength={LIMITS.longText} defaultValue={v("stipend_details")} error={err("stipend_details")} />
        <TextAreaField id="accommodation_details" name="accommodation_details" label="Accommodation details" maxLength={LIMITS.longText} defaultValue={v("accommodation_details")} error={err("accommodation_details")} />
        <TextAreaField id="travel_details" name="travel_details" label="Travel details" maxLength={LIMITS.longText} defaultValue={v("travel_details")} error={err("travel_details")} />
        <TextAreaField id="insurance_details" name="insurance_details" label="Insurance details" maxLength={LIMITS.longText} defaultValue={v("insurance_details")} error={err("insurance_details")} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Eligibility</legend>
        <TextAreaField id="eligibility_summary" name="eligibility_summary" label="Eligibility summary" maxLength={LIMITS.longText} defaultValue={v("eligibility_summary")} error={err("eligibility_summary")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="minimum_gpa" name="minimum_gpa" label="Minimum GPA" inputMode="decimal" defaultValue={v("minimum_gpa")} error={err("minimum_gpa")} />
          <TextField id="minimum_gpa_scale" name="minimum_gpa_scale" label="GPA scale" inputMode="decimal" defaultValue={v("minimum_gpa_scale")} error={err("minimum_gpa_scale")} hint="For example 4 for a 4.0 scale." />
        </div>
        <TextAreaField id="english_requirement_summary" name="english_requirement_summary" label="English requirement summary" maxLength={LIMITS.longText} defaultValue={v("english_requirement_summary")} error={err("english_requirement_summary")} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Dates, fee and links</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id="opening_date" name="opening_date" label="Opening date" type="date" defaultValue={v("opening_date")} error={err("opening_date")} />
          <TextField id="deadline" name="deadline" label="Deadline" type="date" defaultValue={v("deadline")} error={err("deadline")} />
          <TextField id="application_fee" name="application_fee" label="Application fee" inputMode="decimal" defaultValue={v("application_fee")} error={err("application_fee")} hint="Amount only; the database has no currency column." />
        </div>
        <TextField id="official_information_url" name="official_information_url" label="Official information URL" maxLength={LIMITS.url} defaultValue={v("official_information_url")} error={err("official_information_url")} />
        <TextField id="official_application_url" name="official_application_url" label="Official application URL" maxLength={LIMITS.url} defaultValue={v("official_application_url")} error={err("official_application_url")} />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton pendingText="Saving…">{submitLabel}</SaveButton>
        <Button asChild variant="outline"><Link href="/admin/scholarships">Back to list</Link></Button>
      </div>
    </form>
  );
}

/** Keeps `country` state in sync with the native <select> (which stays uncontrolled for form reset behaviour). */
function CountryWatcher({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  useEffect(() => {
    const el = document.getElementById("country_id") as HTMLSelectElement | null;
    if (!el) return;
    const handler = () => onChange(el.value);
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [onChange]);
  return <span hidden data-country={value} />;
}
