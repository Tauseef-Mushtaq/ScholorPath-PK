import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export default function ScholarshipNotFound() {
  return (
    <PageContainer className="space-y-4">
      <h1 className="text-2xl font-semibold">Scholarship not found</h1>
      <p className="max-w-xl text-muted-foreground">
        This scholarship doesn&apos;t exist or is no longer listed. It may have been archived or the link may
        be incorrect.
      </p>
      <Button asChild>
        <Link href="/scholarships">Browse scholarships</Link>
      </Button>
    </PageContainer>
  );
}
