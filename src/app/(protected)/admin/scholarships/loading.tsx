import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer className="space-y-4" aria-busy="true">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-64 w-full" />
    </PageContainer>
  );
}
