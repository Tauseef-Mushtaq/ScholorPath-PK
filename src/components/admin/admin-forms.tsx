"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReport, updateReportStatus } from "@/lib/admin/actions";
import { REPORT_REASONS, REPORT_TARGET_TYPES } from "@/lib/admin/constants";
import type { AdminFormState } from "@/lib/admin/types";

const initial: AdminFormState = {};

function Msg({ state }: { state: AdminFormState }) {
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p className="text-sm text-emerald-700 dark:text-emerald-300">{state.success}</p>;
  return null;
}

export function ReportForm({
  targetType,
  targetId,
}: {
  targetType?: string;
  targetId?: string;
}) {
  const [state, action, pending] = useActionState(submitReport, initial);
  return (
    <form action={action} className="space-y-3">
      {targetType ? <input type="hidden" name="targetType" value={targetType} /> : null}
      {targetId ? <input type="hidden" name="targetId" value={targetId} /> : null}
      {!targetType ? (
        <div className="space-y-1">
          <Label htmlFor="targetType">What are you reporting?</Label>
          <select
            id="targetType"
            name="targetType"
            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
            required
          >
            {REPORT_TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="reason">Reason</Label>
        <select
          id="reason"
          name="reason"
          className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
          required
        >
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="description">Details (optional)</Label>
        <Textarea id="description" name="description" rows={3} maxLength={2000} />
      </div>
      <Msg state={state} />
      <Button type="submit" size="sm" disabled={pending} variant="outline">
        {pending ? "Sending…" : "Submit report"}
      </Button>
    </form>
  );
}

export function ReportStatusButtons({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState(updateReportStatus, initial);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["reviewing", "Reviewing"],
            ["resolved", "Resolve"],
            ["dismissed", "Dismiss"],
            ["open", "Reopen"],
          ] as const
        ).map(([status, label]) => (
          <form key={status} action={action}>
            <input type="hidden" name="reportId" value={reportId} />
            <input type="hidden" name="status" value={status} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {label}
            </Button>
          </form>
        ))}
      </div>
      <Msg state={state} />
    </div>
  );
}
