import type { Metadata } from "next";
import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/session";
import { loadSourceSummaries } from "@/lib/admin/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin · Sources" };

export default async function AdminSourcesPage() {
  await requireRole(["admin"]);
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Unavailable.</p>
      </PageContainer>
    );
  }
  const supabase = await createClient();
  const sources = await loadSourceSummaries(supabase);

  return (
    <PageContainer className="max-w-5xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Scholarship sources</h1>
      <p className="text-sm text-muted-foreground">
        Official URLs attached to scholarships. Edit details on each scholarship admin page.
      </p>
      <AdminNav current="/admin/sources" />
      {!sources ? (
        <p className="text-sm text-muted-foreground">Could not load sources.</p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sources yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="p-2 font-medium">Scholarship</th>
                <th className="p-2 font-medium">URL</th>
                <th className="p-2 font-medium">Verified</th>
                <th className="p-2 font-medium">Last checked</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="p-2">
                    <Link
                      href={`/admin/scholarships/${s.scholarshipId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {s.scholarshipName || s.scholarshipId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate p-2 font-mono text-xs">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {s.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2">
                    <Badge variant="outline">{s.verified ? "Yes" : "No"}</Badge>
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {s.lastCheckedAt ? s.lastCheckedAt.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
