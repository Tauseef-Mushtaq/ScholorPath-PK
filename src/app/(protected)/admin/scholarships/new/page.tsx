import type { Metadata } from "next";

import { ScholarshipForm } from "@/components/admin-scholarships/scholarship-form";
import { PageContainer } from "@/components/layout/page-container";
import { UnavailableState } from "@/components/public/states";
import { createScholarship } from "@/lib/admin-scholarships/actions";
import { listCountryOptions, listUniversityOptions } from "@/lib/admin-scholarships/queries";
import { requireRole } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "New scholarship" };

export default async function NewScholarshipPage() {
  await requireRole(["admin"]);
  let data: [Awaited<ReturnType<typeof listCountryOptions>>, Awaited<ReturnType<typeof listUniversityOptions>>] | null = null;
  if (isSupabaseConfigured()) {
    try { data = await Promise.all([listCountryOptions(), listUniversityOptions()]); } catch { data = null; }
  }
  return (
    <PageContainer className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">New scholarship</h1>
      <p className="text-sm text-muted-foreground">New scholarships are saved as drafts. Publishing is a separate step.</p>
      {data ? <ScholarshipForm action={createScholarship} initial={{}} countries={data[0]} universities={data[1]} submitLabel="Create draft" /> : <UnavailableState />}
    </PageContainer>
  );
}
