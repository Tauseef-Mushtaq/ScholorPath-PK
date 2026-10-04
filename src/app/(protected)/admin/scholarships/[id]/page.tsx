import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmActionButton } from "@/components/admin-scholarships/confirm-action-button";
import { ScholarshipForm } from "@/components/admin-scholarships/scholarship-form";
import { SourcesPanel } from "@/components/admin-scholarships/sources-panel";
import { PageContainer } from "@/components/layout/page-container";
import { UnavailableState } from "@/components/public/states";
import { Badge } from "@/components/ui/badge";
import { changeScholarshipStatus, deleteScholarship, markScholarshipVerified, updateScholarship } from "@/lib/admin-scholarships/actions";
import {
  countApplications, getAdminScholarship, listCountryOptions, listSources, listUniversityOptions,
} from "@/lib/admin-scholarships/queries";
import { isUuid } from "@/lib/admin-scholarships/validation";
import { requireRole } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/public/format";

export const metadata: Metadata = { title: "Edit scholarship" };

export default async function EditScholarshipPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  if (!isUuid(id) || !isSupabaseConfigured()) notFound();

  let loaded;
  try {
    loaded = await Promise.all([getAdminScholarship(id), listCountryOptions(), listUniversityOptions(), listSources(id), countApplications(id)]);
  } catch {
    return <PageContainer><UnavailableState /></PageContainer>;
  }
  const [s, countries, universities, sources, appCount] = loaded;
  if (!s) notFound();

  return (
    <PageContainer className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link className="text-sm underline" href="/admin/scholarships">← All scholarships</Link>
        <h1 className="text-3xl font-bold tracking-tight">{s.values.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant={s.status === "active" ? "default" : s.status === "archived" ? "warning" : "muted"}>{s.status}</Badge>
          <span>Updated {formatDate(s.updatedAt)}</span>
          <span>{s.lastVerifiedAt ? `Last verified ${formatDate(s.lastVerifiedAt)}` : "Never verified"}</span>
        </div>
      </div>

      <section aria-labelledby="status-h" className="space-y-3 rounded-lg border p-4">
        <h2 id="status-h" className="text-lg font-semibold">Publication</h2>
        <p className="text-sm text-muted-foreground">Only <strong>active</strong> scholarships are public. Review the details and sources before publishing.</p>
        <div className="flex flex-col gap-3">
          {s.status !== "active" && s.status !== "archived" ? (
            <ConfirmActionButton action={changeScholarshipStatus} fields={{ id, to: "active" }} label="Publish" variant="default" confirmText="Make this scholarship publicly visible?" confirmLabel="Yes, publish" />
          ) : null}
          {s.status === "active" ? (
            <ConfirmActionButton action={changeScholarshipStatus} fields={{ id, to: "draft" }} label="Unpublish (back to draft)" confirmText="Hide this scholarship from the public?" confirmLabel="Yes, unpublish" />
          ) : null}
          {s.status !== "archived" ? (
            <ConfirmActionButton action={changeScholarshipStatus} fields={{ id, to: "archived" }} label="Archive" confirmText="Archive this scholarship? It will no longer be public." confirmLabel="Yes, archive" />
          ) : (
            <ConfirmActionButton action={changeScholarshipStatus} fields={{ id, to: "draft" }} label="Restore as draft" confirmText="Restore as a draft (still not public)?" confirmLabel="Yes, restore" />
          )}
          <ConfirmActionButton action={markScholarshipVerified} fields={{ id }} label="Mark verified now" confirmText="Confirm you checked the official source today?" confirmLabel="Yes, I checked it" />
        </div>
      </section>

      <section aria-labelledby="details-h" className="space-y-3">
        <h2 id="details-h" className="text-lg font-semibold">Details</h2>
        <ScholarshipForm action={updateScholarship} id={id} initial={s.values} countries={countries} universities={universities} submitLabel="Save changes" />
      </section>

      <section aria-labelledby="sources-h" className="space-y-3">
        <h2 id="sources-h" className="text-lg font-semibold">Sources</h2>
        <SourcesPanel scholarshipId={id} sources={sources} />
      </section>

      <section aria-labelledby="danger-h" className="space-y-3 rounded-lg border border-destructive/40 p-4">
        <h2 id="danger-h" className="text-lg font-semibold">Delete</h2>
        {appCount === null ? (
          <p className="text-sm text-muted-foreground">Could not check applications. Archive instead of deleting.</p>
        ) : appCount > 0 ? (
          <p className="text-sm text-muted-foreground">{appCount} application(s) reference this scholarship, so it cannot be deleted. Archive it instead.</p>
        ) : s.status === "active" ? (
          <p className="text-sm text-muted-foreground">Unpublish or archive before deleting.</p>
        ) : (
          <ConfirmActionButton action={deleteScholarship} fields={{ id }} label="Delete scholarship" variant="destructive" confirmText="Delete permanently, with its sources and requirements?" confirmLabel="Yes, delete" />
        )}
      </section>
    </PageContainer>
  );
}
