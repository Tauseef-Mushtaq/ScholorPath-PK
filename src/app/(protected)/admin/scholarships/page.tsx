import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { EmptyState, UnavailableState } from "@/components/public/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAdminScholarships } from "@/lib/admin-scholarships/queries";
import { ADMIN_PAGE_SIZE, parseAdminListFilters, STATUSES } from "@/lib/admin-scholarships/validation";
import { requireRole } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/public/format";

export const metadata: Metadata = { title: "Manage scholarships" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const VARIANT = { draft: "muted", active: "default", archived: "warning" } as const;

export default async function AdminScholarshipsPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const filters = parseAdminListFilters(params);
  let result: Awaited<ReturnType<typeof listAdminScholarships>> | null = null;
  if (isSupabaseConfigured()) {
    try { result = await listAdminScholarships(filters); } catch { result = null; }
  }
  const href = (page: number) => {
    const sp = new URLSearchParams();
    if (filters.q) sp.set("q", filters.q);
    if (filters.status) sp.set("status", filters.status);
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    return `/admin/scholarships${qs ? `?${qs}` : ""}`;
  };
  const pages = result ? Math.max(1, Math.ceil(result.total / ADMIN_PAGE_SIZE)) : 1;

  return (
    <PageContainer className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Scholarships</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/admin/scholarships/import">Import</Link></Button>
          <Button asChild><Link href="/admin/scholarships/new">New scholarship</Link></Button>
        </div>
      </div>
      {params.deleted === "1" ? <p role="status" className="rounded-md border border-primary/40 px-3 py-2 text-sm text-primary">Scholarship deleted.</p> : null}
      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="space-y-1">
          <label htmlFor="q" className="text-sm font-medium">Search name or provider</label>
          <input id="q" name="q" defaultValue={filters.q ?? ""} maxLength={80} className="flex h-9 w-64 rounded-md border border-input bg-background px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="status" className="text-sm font-medium">Status</label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className="flex h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {result === null ? <UnavailableState /> : result.items.length === 0 ? (
        <EmptyState title="No scholarships found" description="Create one, or import a verified dataset as drafts." action={{ href: "/admin/scholarships/new", label: "New scholarship" }} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">Name</th><th className="p-3">Country</th><th className="p-3">University</th>
                <th className="p-3">Status</th><th className="p-3">Deadline</th><th className="p-3">Updated</th><th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3"><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.provider}</div></td>
                  <td className="p-3">{s.country ?? "—"}</td>
                  <td className="p-3">{s.university ?? "—"}</td>
                  <td className="p-3"><Badge variant={VARIANT[s.status]}>{s.status}</Badge></td>
                  <td className="p-3">{formatDate(s.deadline) ?? "—"}</td>
                  <td className="p-3">{formatDate(s.updatedAt) ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    <Link className="underline" href={`/admin/scholarships/${s.id}`}>Edit</Link>
                    {s.status === "active" ? <> · <Link className="underline" href={`/scholarships/${s.id}`}>View public</Link></> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result && pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          {filters.page > 1 ? <Link className="underline" href={href(filters.page - 1)}>Previous</Link> : <span />}
          <span>Page {filters.page} of {pages} ({result.total} total)</span>
          {filters.page < pages ? <Link className="underline" href={href(filters.page + 1)}>Next</Link> : <span />}
        </nav>
      ) : null}
    </PageContainer>
  );
}
