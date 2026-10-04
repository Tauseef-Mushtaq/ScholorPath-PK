import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ApplicationDetailLoading() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-9 w-2/3 max-w-lg" />
      <Skeleton className="mt-2 h-4 w-48" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <Skeleton className="mt-6 h-64 w-full" />
    </PageContainer>
  );
}
