import type { Metadata } from "next";
import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { loadAdminStats } from "@/lib/admin/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
  return href ? (
    <Link href={href} className="block transition-opacity hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default async function AdminHome() {
  await requireRole(["admin"]);
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Admin is temporarily unavailable.</p>
      </PageContainer>
    );
  }

  const supabase = await createClient();
  const stats = await loadAdminStats(supabase);

  return (
    <PageContainer className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scholarship data, mentors, RAG, and moderation. Role changes use service-role{" "}
          <code className="text-xs">set_user_role</code> only.
        </p>
      </div>
      <AdminNav current="/admin" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active scholarships" value={stats.scholarshipsActive} href="/admin/scholarships" />
        <Stat label="Draft scholarships" value={stats.scholarshipsDraft} href="/admin/scholarships" />
        <Stat label="Pending mentors" value={stats.mentorsPending} href="/admin/mentors" />
        <Stat label="Verified mentors" value={stats.mentorsVerified} href="/admin/mentors" />
        <Stat label="Open reports" value={stats.reportsOpen} href="/admin/reports" />
        <Stat label="Profiles" value={stats.profilesTotal} href="/admin/users" />
        <Stat label="Knowledge docs" value={stats.knowledgeDocuments} href="/admin/rag" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link href="/admin/scholarships/import" className="text-primary underline-offset-4 hover:underline">
            Import scholarships
          </Link>
          <Link href="/admin/settings" className="text-primary underline-offset-4 hover:underline">
            System health
          </Link>
          <Link href="/api/health" className="text-primary underline-offset-4 hover:underline">
            /api/health
          </Link>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
