import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export default function CountryNotFound() {
  return (
    <PageContainer className="space-y-4">
      <h1 className="text-2xl font-semibold">Country not found</h1>
      <p className="max-w-xl text-muted-foreground">
        We couldn&apos;t find that destination. Check the link or choose a country from the list.
      </p>
      <Button asChild>
        <Link href="/countries">All countries</Link>
      </Button>
    </PageContainer>
  );
}
