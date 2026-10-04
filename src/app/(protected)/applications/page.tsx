import type { Metadata } from "next";
import Link from "next/link";

import { ApplicationCard } from "@/components/applications/application-card";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { todayIsoDate } from "@/lib/applications/format";
import { loadOwnApplications } from "@/lib/applications/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My applications" };

export default async function ApplicationsPage() {
  const { user } = await requireUser();
  const today = todayIsoDate();

  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <h1 className="text-3xl font-bold tracking-tight">My applications</h1>
        <p className="mt-4 text-muted-foreground">Applications are temporarily unavailable. Please try again later.</p>
      </PageContainer>
    );
  }

  const supabase = await createClient();
  const list = await loadOwnApplications(supabase, user.id);

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track status, tasks, notes and deadlines. ScholarPath never submits applications for you.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/scholarships">Browse scholarships</Link>
        </Button>
      </div>

      {list === null ? (
        <p className="mt-8 text-muted-foreground">Applications are temporarily unavailable. Please try again later.</p>
      ) : list.length === 0 ? (
        <div className="mt-8 space-y-3 rounded-lg border p-6">
          <p className="font-medium">No applications yet</p>
          <p className="text-sm text-muted-foreground">
            Open a scholarship and choose &quot;Track in my workspace&quot;, or ask the agent to prepare you for one — that
            creates a planning row you can manage here.
          </p>
          <Button asChild size="sm">
            <Link href="/matches">View my matches</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {list.map((item) => (
            <li key={item.id}>
              <ApplicationCard item={item} todayIso={today} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
