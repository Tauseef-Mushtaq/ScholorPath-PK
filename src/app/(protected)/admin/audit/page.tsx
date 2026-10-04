import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageContainer } from "@/components/layout/page-container";
import { requireRole } from "@/lib/auth/session";
import { loadAdminActions } from "@/lib/admin/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin · Audit" };

export default async function AdminAuditPage() {
  await requireRole(["admin"]);
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Unavailable.</p>
      </PageContainer>
    );
  }
  const supabase = await createClient();
  const actions = await loadAdminActions(supabase, 80);

  return (
    <PageContainer className="max-w-5xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
      <p className="text-sm text-muted-foreground">
        Append-only <code className="text-xs">admin_actions</code>. History is not editable from the app.
      </p>
      <AdminNav current="/admin/audit" />
      {!actions ? (
        <p className="text-sm text-muted-foreground">Could not load audit log.</p>
      ) : actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No admin actions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="p-2 font-medium">When</th>
                <th className="p-2 font-medium">Action</th>
                <th className="p-2 font-medium">Target</th>
                <th className="p-2 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{a.createdAt.slice(0, 19)}</td>
                  <td className="p-2 font-medium">{a.actionType}</td>
                  <td className="p-2 text-muted-foreground">
                    {a.targetType || "—"}
                    {a.targetId ? ` · ${a.targetId.slice(0, 8)}…` : ""}
                  </td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">
                    {a.adminUserId ? `${a.adminUserId.slice(0, 8)}…` : "system"}
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
