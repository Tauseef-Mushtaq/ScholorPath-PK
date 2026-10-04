import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  await requireRole(["admin"]);

  const checks = [
    { label: "Supabase configured", ok: isSupabaseConfigured() },
    {
      label: "Gemini API key present",
      ok: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    },
    { label: "App URL set", ok: Boolean(process.env.NEXT_PUBLIC_APP_URL) },
  ];

  return (
    <PageContainer className="max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Settings &amp; health</h1>
      <p className="text-sm text-muted-foreground">
        Configuration flags only — secret values are never shown.
      </p>
      <AdminNav current="/admin/settings" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment</CardTitle>
          <CardDescription>Server-side presence checks.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-2 border-b py-2 last:border-0">
                <span>{c.label}</span>
                <Badge variant={c.ok ? "outline" : "destructive"}>{c.ok ? "OK" : "Missing"}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Production checklist</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>All migrations applied (including reports + mentor community).</li>
            <li>RLS enabled on every user-owned table; verified with two test users.</li>
            <li>Admin role granted only via service-role set_user_role.</li>
            <li>Site URL and redirect allow-list configured in Supabase Auth.</li>
            <li>No AI keys in NEXT_PUBLIC_* variables.</li>
            <li>Document bucket private; signed URLs short-lived.</li>
            <li>Security headers enabled (see next.config).</li>
          </ul>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
