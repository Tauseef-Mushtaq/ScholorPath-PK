import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export default function ApplicationNotFound() {
  return (
    <PageContainer>
      <h1 className="text-2xl font-bold">Application not found</h1>
      <p className="mt-2 text-muted-foreground">It may have been deleted, or it does not belong to your account.</p>
      <Button asChild className="mt-6" size="sm">
        <Link href="/applications">Back to applications</Link>
      </Button>
    </PageContainer>
  );
}
