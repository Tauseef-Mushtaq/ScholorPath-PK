import { Skeleton } from "@/components/ui/skeleton";

export function ScholarshipCardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-4 w-1/2" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  );
}

export function CountryCardSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-5">
      <div className="w-full space-y-2">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function PageHeadingSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="h-5 w-96 max-w-full" />
    </div>
  );
}
