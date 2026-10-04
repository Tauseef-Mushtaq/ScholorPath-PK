"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  addTask,
  updateApplicationNotes,
  updateApplicationStatus,
  updateTaskStatus,
} from "@/lib/applications/actions";
import { APPLICATION_STATUSES, TASK_STATUSES } from "@/lib/applications/constants";
import type { ApplicationFormState, ApplicationTask } from "@/lib/applications/types";

const initial: ApplicationFormState = {};

export function StatusForm({ applicationId, status }: { applicationId: string; status: string }) {
  const [state, action, pending] = useActionState(updateApplicationStatus, initial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <Label htmlFor="status">Status</Label>
      <div className="flex flex-wrap gap-2">
        <select
          id="status"
          name="status"
          defaultValue={status}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          disabled={pending}
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Update status"}
        </Button>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-muted-foreground">{state.success}</p> : null}
    </form>
  );
}

export function NotesForm({ applicationId, notes }: { applicationId: string; notes: string | null }) {
  const [state, action, pending] = useActionState(updateApplicationNotes, initial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <Label htmlFor="notes">Notes</Label>
      <textarea
        id="notes"
        name="notes"
        rows={4}
        defaultValue={notes ?? ""}
        className="w-full rounded-md border bg-background p-2 text-sm"
        disabled={pending}
        maxLength={4000}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save notes"}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-muted-foreground">{state.success}</p> : null}
    </form>
  );
}

export function TaskStatusSelect({ task, applicationId }: { task: ApplicationTask; applicationId: string }) {
  const [state, action, pending] = useActionState(updateTaskStatus, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="applicationId" value={applicationId} />
      <select
        name="status"
        defaultValue={task.status}
        className="h-8 rounded-md border bg-background px-2 text-xs"
        disabled={pending}
        aria-label={`Status for ${task.title}`}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Save"}
      </Button>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

export function AddTaskForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(addTask, initial);
  return (
    <form action={action} className="space-y-2 border-t pt-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <Label htmlFor="title">Add a task</Label>
      <input
        id="title"
        name="title"
        required
        minLength={3}
        maxLength={140}
        placeholder="Task title"
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        disabled={pending}
      />
      <textarea
        name="description"
        rows={2}
        maxLength={600}
        placeholder="Optional description"
        className="w-full rounded-md border bg-background p-2 text-sm"
        disabled={pending}
      />
      <input type="date" name="dueDate" className="h-9 rounded-md border bg-background px-2 text-sm" disabled={pending} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add task"}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-muted-foreground">{state.success}</p> : null}
    </form>
  );
}
