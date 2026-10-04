import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AnswerForm, StoryForm, TimelineForm } from "@/components/mentors/mentor-forms";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { PERSONAL_EXPERIENCE_LABEL, storyStatusLabel } from "@/lib/mentors/constants";
import {
  loadOpenQuestions,
  loadOwnMentorClaim,
  loadOwnStories,
  loadTimelineForMentor,
} from "@/lib/mentors/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mentor dashboard" };

export default async function MentorDashboardPage() {
  const { user, role } = await requireUser();
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Mentor dashboard is temporarily unavailable.</p>
      </PageContainer>
    );
  }

  const supabase = await createClient();
  const claim = await loadOwnMentorClaim(supabase, user.id);
  if (claim === "error") {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Could not load mentor profile.</p>
      </PageContainer>
    );
  }
  if (!claim || claim.verificationStatus !== "verified") {
    if (role === "admin") {
      // admins without a mentor claim can still use admin tools
      redirect("/admin/mentors");
    }
    redirect("/mentor/apply");
  }

  const [stories, timeline, questions] = await Promise.all([
    loadOwnStories(supabase, claim.id),
    loadTimelineForMentor(supabase, claim.id),
    loadOpenQuestions(supabase, 20),
  ]);

  return (
    <PageContainer className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mentor dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">{PERSONAL_EXPERIENCE_LABEL}</p>
        <p className="mt-1 text-sm">
          <Link href={`/mentors/${claim.id}`} className="text-primary underline-offset-4 hover:underline">
            View public profile
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New story</CardTitle>
          <CardDescription>Journeys, interview tips, and lessons learned.</CardDescription>
        </CardHeader>
        <CardContent>
          <StoryForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your stories</CardTitle>
        </CardHeader>
        <CardContent>
          {!stories || stories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stories yet.</p>
          ) : (
            <ul className="space-y-3">
              {stories.map((s) => (
                <li key={s.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{s.title}</p>
                    <Badge variant="outline">{storyStatusLabel(s.status)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TimelineForm />
          {timeline && timeline.length > 0 ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {timeline.map((t) => (
                <li key={t.id}>
                  <span className="font-medium">{t.title}</span>
                  {t.dateOrPeriod ? <span className="text-muted-foreground"> · {t.dateOrPeriod}</span> : null}
                  {t.description ? <p className="text-muted-foreground">{t.description}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open questions</CardTitle>
          <CardDescription>Answer from personal experience only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!questions || questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open questions right now.</p>
          ) : (
            questions.map((q) => (
              <div key={q.id} className="rounded-md border p-3 space-y-2">
                <p className="font-medium">{q.title}</p>
                <p className="text-sm text-muted-foreground">{q.body}</p>
                <AnswerForm questionId={q.id} questionText={q.title} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
