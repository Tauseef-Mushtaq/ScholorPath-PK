import { PageContainer } from "@/components/layout/page-container";
import { PageHeadingSkeleton, ScholarshipCardSkeleton } from "@/components/public/skeletons";

export default function Loading() {
  return (
    <PageContainer className="space-y-8">
      <PageHeadingSkeleton />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <ScholarshipCardSkeleton />
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
