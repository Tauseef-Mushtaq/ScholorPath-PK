/**
 * Superseded by the role-based sidebar in `(protected)/layout.tsx`
 * (links live in `src/lib/config/dashboard-nav.ts`). Kept as a no-op so existing admin
 * pages that render `<AdminNav current=... />` keep working without duplicate navigation.
 */
export function AdminNav(_props: { current?: string }) {
  return null;
}
