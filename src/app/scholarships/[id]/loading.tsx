import { PageContainer } from "@/components/layout/page-container";
import { PageHeadingSkeleton } from "@/components/public/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer className="space-y-8">
      <PageHeadingSkeleton />
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]" aria-hidden>
        <Skeleton className="h-72" />
        <Skeleton className="h-48" />
      </div>
    </PageContainer>
  );
}
