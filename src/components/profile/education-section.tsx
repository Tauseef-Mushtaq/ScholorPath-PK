"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteEducation, saveEducation } from "@/lib/profile/actions";
import { dateRange, formatGpa, levelLabel } from "@/lib/profile/format";
import { EDUCATION_LEVELS, type EducationRow, type ProfileFormState } from "@/lib/profile/types";
import { LIMITS } from "@/lib/profile/validation";

import { DeleteButton } from "./delete-button";
import { SelectField, TextField } from "./fields";
import { SaveButton } from "./form-buttons";

function EducationForm({ record, onDone }: { record: EducationRow | null; onDone: (msg: string) => void }) {
  const [state, formAction] = useActionState<ProfileFormState, FormData>(async (prev, fd) => {
    const result = await saveEducation(prev, fd);
    if (result.success) onDone(result.success);
    return result;
  }, {});
  const v = state.values;
  const e = state.fieldErrors;
  const val = (k: keyof EducationRow) => v?.[k] ?? (record?.[k] == null ? "" : String(record[k]));

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4" noValidate>
      {/* Only the record id (for edits) is sent. Ownership is derived on the server. */}
      {record ? <input type="hidden" name="id" value={record.id} /> : null}
      <FormMessage error={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="edu-level" name="level" label="Level" required options={EDUCATION_LEVELS} defaultValue={val("level")} error={e?.level} />
        <TextField id="edu-institution" name="institution" label="Institution" required maxLength={LIMITS.institution} defaultValue={val("institution")} error={e?.institution} />
        <TextField id="edu-degree" name="degree_name" label="Degree name" maxLength={LIMITS.degreeName} defaultValue={val("degree_name")} error={e?.degree_name} hint="For example: BSc Computer Science" />
        <TextField id="edu-field" name="field" label="Field of study" maxLength={LIMITS.field} defaultValue={val("field")} error={e?.field} />
        <TextField id="edu-cgpa" name="cgpa" label="CGPA" inputMode="decimal" defaultValue={val("cgpa")} error={e?.cgpa} />
        <TextField id="edu-scale" name="cgpa_scale" label="CGPA scale" inputMode="decimal" defaultValue={val("cgpa_scale")} error={e?.cgpa_scale} hint="For example 4 or 4.00 if your CGPA is out of 4." />
        <TextField id="edu-start" name="start_date" label="Start date" type="date" defaultValue={val("start_date")} error={e?.start_date} />
        <TextField id="edu-grad" name="expected_graduation" label="Graduation date (expected or actual)" type="date" defaultValue={val("expected_graduation")} error={e?.expected_graduation} />
      </div>
      <div className="flex gap-2">
        <SaveButton>{record ? "Save changes" : "Add education"}</SaveButton>
        <Button type="button" variant="outline" onClick={() => onDone("")}>Cancel</Button>
      </div>
    </form>
  );
}

export function EducationSection({ items }: { items: EducationRow[] }) {
  // "new" = adding, an id = editing that record, null = just viewing.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [notice, setNotice] = useState<string | undefined>();
  const done = (msg: string) => { setEditing(null); setNotice(msg || undefined); };

  return (
    <Card id="education" className="scroll-mt-4">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Education</CardTitle>
          <CardDescription>Your academic history. Scholarships often depend on level, field and GPA.</CardDescription>
        </div>
        {editing !== "new" ? (
          <Button size="sm" onClick={() => { setNotice(undefined); setEditing("new"); }}>Add education</Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <FormMessage success={notice} />
        {editing === "new" ? <EducationForm record={null} onDone={done} /> : null}
        {items.length === 0 && editing !== "new" ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No education records yet. Add your education history to improve your scholarship matches.
          </p>
        ) : null}
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id}>
              {editing === e.id ? (
                <EducationForm record={e} onDone={done} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
                  <div className="space-y-1">
                    <p className="font-medium">{e.institution}</p>
                    <p className="text-sm text-muted-foreground">
                      {[levelLabel(e.level), e.degree_name, e.field].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[formatGpa(e.cgpa, e.cgpa_scale) && `CGPA ${formatGpa(e.cgpa, e.cgpa_scale)}`, dateRange(e.start_date, e.expected_graduation, "present")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => { setNotice(undefined); setEditing(e.id); }} aria-label={`Edit ${e.institution}`}>Edit</Button>
                    <DeleteButton id={e.id} action={deleteEducation} label={e.institution ?? "education record"} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
