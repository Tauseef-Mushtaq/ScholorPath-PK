import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { loadAdminProfiles } from "@/lib/admin/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage() {
  await requireRole(["admin"]);
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Unavailable.</p>
      </PageContainer>
    );
  }
  const supabase = await createClient();
  const profiles = await loadAdminProfiles(supabase);

  return (
    <PageContainer className="max-w-5xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Users</h1>
      <p className="text-sm text-muted-foreground">
        Read-only profile list. Elevating roles requires service-role{" "}
        <code className="text-xs">set_user_role</code> outside this UI.
      </p>
      <AdminNav current="/admin/users" />
      {!profiles ? (
        <p className="text-sm text-muted-foreground">Could not load profiles.</p>
      ) : profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No profiles yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Role</th>
                <th className="p-2 font-medium">Nationality</th>
                <th className="p-2 font-medium">User id</th>
                <th className="p-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-2">{p.fullName || "—"}</td>
                  <td className="p-2">
                    <Badge variant="outline">{p.role}</Badge>
                  </td>
                  <td className="p-2 text-muted-foreground">{p.nationality || "—"}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{p.userId.slice(0, 8)}…</td>
                  <td className="p-2 text-muted-foreground">{p.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
