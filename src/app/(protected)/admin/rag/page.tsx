import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { loadKnowledgeStatus } from "@/lib/admin/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin · RAG" };

export default async function AdminRagPage() {
  await requireRole(["admin"]);
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Unavailable.</p>
      </PageContainer>
    );
  }
  const supabase = await createClient();
  const status = await loadKnowledgeStatus(supabase);

  return (
    <PageContainer className="max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">RAG knowledge</h1>
      <p className="text-sm text-muted-foreground">
        Ingestion is driven by verified scholarship sources via{" "}
        <code className="text-xs">POST /api/admin/knowledge/ingest</code>. API keys never leave the server.
      </p>
      <AdminNav current="/admin/rag" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total documents</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{status?.total ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ready</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{status?.ready ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{status?.failed ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{status?.pending ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operations</CardTitle>
          <CardDescription>
            Use the existing ingest API from a trusted server context. This page is monitoring only — no browser
            calls to Gemini.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Verify official sources on each scholarship.</li>
            <li>Call ingest for a source id when content should enter the knowledge base.</li>
            <li>Empty corpus is valid; assistant/agent refuse when evidence is insufficient.</li>
          </ol>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
