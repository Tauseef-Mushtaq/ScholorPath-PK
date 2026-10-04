import type { Metadata } from "next";
import Link from "next/link";

import { ImportForm } from "@/components/admin-scholarships/import-form";
import { PageContainer } from "@/components/layout/page-container";
import { requireRole } from "@/lib/auth/session";
import { IMPORT_MAX_RECORDS } from "@/lib/admin-scholarships/import";

export const metadata: Metadata = { title: "Import scholarships" };

export default async function ImportPage() {
  await requireRole(["admin"]);
  return (
    <PageContainer className="max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Import verified scholarships</h1>
      <p className="text-sm text-muted-foreground">
        Paste a JSON array (max {IMPORT_MAX_RECORDS} records). Use <code>country_slug</code> and optional <code>university_slug</code> of
        existing records plus the scholarship fields documented in <code>docs/DATA_IMPORT.md</code>. Only import records you have verified
        against the official source. All records are created as drafts; the import is all-or-nothing and never publishes.
      </p>
      <ImportForm />
      <Link className="text-sm underline" href="/admin/scholarships">Back to list</Link>
    </PageContainer>
  );
}
