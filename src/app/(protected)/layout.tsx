import { requireUser } from "@/lib/auth/session";

// Auth-dependent: never prerender statically.
export const dynamic = "force-dynamic";

/**
 * Server-side authentication gate for every page in this route group.
 * The proxy redirect is only an optimistic first check; this is the real one.
 * Put all authenticated pages (dashboard, profile, documents, ...) inside `(protected)`.
 * Role-restricted areas must additionally call `requireRole([...])`.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
