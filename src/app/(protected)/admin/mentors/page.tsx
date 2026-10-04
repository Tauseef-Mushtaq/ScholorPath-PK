import type { Metadata } from "next";
import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { AdminVerifyButtons } from "@/components/mentors/mentor-forms";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { verificationLabel } from "@/lib/mentors/constants";
import { loadAllMentorClaims } from "@/lib/mentors/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Mentors" };

export default async function AdminMentorsPage() {
  await requireRole(["admin"]);
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Admin mentors is temporarily unavailable.</p>
      </PageContainer>
    );
  }

  // Use service-role client so pending claims are always visible after requireRole.
  // User-scoped client + RLS is_admin() can fail to return rows in edge cases.
  const supabase = createAdminClient();
  const claims = await loadAllMentorClaims(supabase);

  return (
    <PageContainer className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Mentor verification</h1>
      <AdminNav current="/admin/mentors" />
        <p className="mt-2 text-sm text-muted-foreground">
          Verify scholarship claims before mentors can publish stories. Role elevation to{" "}
          <code className="text-xs">mentor</code> still requires service-role{" "}
          <code className="text-xs">set_user_role</code> if needed; verification alone unlocks mentor content.
        </p>
      </div>

      {!claims || claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">No mentor applications yet.</p>
      ) : (
        <ul className="space-y-4">
          {claims.map((c) => (
            <li key={c.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base font-medium">
                      {c.field || "Field not set"} · {c.degreeLevel || "Degree not set"}
                    </CardTitle>
                    <Badge variant="outline">{verificationLabel(c.verificationStatus)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    User {c.userId.slice(0, 8)}… · award year {c.awardYear ?? "—"} · applied{" "}
                    {c.createdAt.slice(0, 10)}
                  </p>
                  {c.scholarshipId ? (
                    <p>
                      Scholarship:{" "}
                      <Link href={`/scholarships/${c.scholarshipId}`} className="underline-offset-4 hover:underline">
                        {c.scholarshipId}
                      </Link>
                    </p>
                  ) : null}
                  <AdminVerifyButtons mentorId={c.id} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
