import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { requireUser } from "@/lib/auth/session";

// Auth-dependent: never prerender statically.
export const dynamic = "force-dynamic";

/**
 * Server-side authentication gate for every page in this route group.
 * The proxy redirect is only an optimistic first check; this is the real one.
 * Put all authenticated pages (dashboard, profile, documents, ...) inside `(protected)`.
 * Role-restricted areas must additionally call `requireRole([...])`.
 *
 * Every authenticated page gets the role-based sidebar (student / mentor / admin).
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireUser();
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col md:flex-row md:gap-2">
      <DashboardSidebar role={role} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
