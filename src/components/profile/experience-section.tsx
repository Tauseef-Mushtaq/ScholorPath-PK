"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteExperience, saveExperience } from "@/lib/profile/actions";
import { dateRange, experienceTypeLabel } from "@/lib/profile/format";
import { EXPERIENCE_TYPES, type ExperienceRow, type ProfileFormState } from "@/lib/profile/types";
import { LIMITS } from "@/lib/profile/validation";

import { DeleteButton } from "./delete-button";
import { SelectField, TextAreaField, TextField } from "./fields";
import { SaveButton } from "./form-buttons";

function ExperienceForm({ record, onDone }: { record: ExperienceRow | null; onDone: (msg: string) => void }) {
  const [state, formAction] = useActionState<ProfileFormState, FormData>(async (prev, fd) => {
    const result = await saveExperience(prev, fd);
    if (result.success) onDone(result.success);
    return result;
  }, {});
  const v = state.values;
  const e = state.fieldErrors;
  const val = (k: keyof ExperienceRow) => v?.[k] ?? (record?.[k] == null ? "" : String(record[k]));

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4" noValidate>
      {record ? <input type="hidden" name="id" value={record.id} /> : null}
      <FormMessage error={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="exp-type" name="experience_type" label="Type" required options={EXPERIENCE_TYPES} defaultValue={val("experience_type")} error={e?.experience_type} />
        <TextField id="exp-title" name="title" label="Title / role" required maxLength={LIMITS.title} defaultValue={val("title")} error={e?.title} />
        <TextField id="exp-org" name="organization" label="Organization" maxLength={LIMITS.organization} defaultValue={val("organization")} error={e?.organization} />
        <div className="hidden sm:block" aria-hidden />
        <TextField id="exp-start" name="start_date" label="Start date" type="date" defaultValue={val("start_date")} error={e?.start_date} />
        <TextField id="exp-end" name="end_date" label="End date" type="date" defaultValue={val("end_date")} error={e?.end_date} hint="Leave empty if this is ongoing." />
      </div>
      <TextAreaField id="exp-desc" name="description" label="Description" maxLength={LIMITS.description} defaultValue={val("description")} error={e?.description} hint={`Up to ${LIMITS.description} characters.`} />
      <div className="flex gap-2">
        <SaveButton>{record ? "Save changes" : "Add experience"}</SaveButton>
        <Button type="button" variant="outline" onClick={() => onDone("")}>Cancel</Button>
      </div>
    </form>
  );
}

export function ExperienceSection({ items }: { items: ExperienceRow[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [notice, setNotice] = useState<string | undefined>();
  const done = (msg: string) => { setEditing(null); setNotice(msg || undefined); };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Experience</CardTitle>
          <CardDescription>Work, internships, research, volunteering and leadership. Optional, but it strengthens applications.</CardDescription>
        </div>
        {editing !== "new" ? (
          <Button size="sm" onClick={() => { setNotice(undefined); setEditing("new"); }}>Add experience</Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <FormMessage success={notice} />
        {editing === "new" ? <ExperienceForm record={null} onDone={done} /> : null}
        {items.length === 0 && editing !== "new" ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No experience added yet. Internships, research and volunteering all count.
          </p>
        ) : null}
        <ul className="space-y-3">
          {items.map((x) => (
            <li key={x.id}>
              {editing === x.id ? (
                <ExperienceForm record={x} onDone={done} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
                  <div className="space-y-1">
                    <p className="font-medium">{x.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {[experienceTypeLabel(x.experience_type), x.organization, dateRange(x.start_date, x.end_date, "present")].filter(Boolean).join(" · ")}
                    </p>
                    {x.description ? <p className="whitespace-pre-line text-sm">{x.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => { setNotice(undefined); setEditing(x.id); }} aria-label={`Edit ${x.title}`}>Edit</Button>
                    <DeleteButton id={x.id} action={deleteExperience} label={x.title ?? "experience"} />
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
