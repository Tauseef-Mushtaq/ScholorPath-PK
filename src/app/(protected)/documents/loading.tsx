import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsLoading() {
  return (
    <PageContainer className="max-w-4xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
      <span className="sr-only">Loading your documents…</span>
    </PageContainer>
  );
}
