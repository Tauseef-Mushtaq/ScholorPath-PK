import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { ReportStatusButtons } from "@/components/admin/admin-forms";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  reportReasonLabel,
  reportStatusLabel,
  reportTargetLabel,
} from "@/lib/admin/constants";
import { loadReports } from "@/lib/admin/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin · Reports" };

export default async function AdminReportsPage() {
  await requireRole(["admin"]);
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Unavailable.</p>
      </PageContainer>
    );
  }
  const supabase = await createClient();
  const reports = await loadReports(supabase, "all", 80);

  return (
    <PageContainer className="max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
      <p className="text-sm text-muted-foreground">Moderation queue for user-submitted flags.</p>
      <AdminNav current="/admin/reports" />
      {!reports ? (
        <p className="text-sm text-muted-foreground">
          Could not load reports (apply Module 18 migration if the table is missing).
        </p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports yet.</p>
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li key={r.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {reportTargetLabel(r.targetType)} · {reportReasonLabel(r.reason)}
                    </CardTitle>
                    <Badge variant="outline">{reportStatusLabel(r.status)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {r.description ? <p className="text-muted-foreground">{r.description}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {r.createdAt.slice(0, 19)} · reporter {r.reporterUserId.slice(0, 8)}…
                    {r.targetId ? ` · target ${r.targetId.slice(0, 8)}…` : ""}
                  </p>
                  <ReportStatusButtons reportId={r.id} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
