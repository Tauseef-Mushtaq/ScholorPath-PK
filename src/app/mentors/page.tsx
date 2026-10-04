import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Users } from "lucide-react";

import { AskQuestionForm } from "@/components/mentors/mentor-forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/public/page-header";
import { EmptyState } from "@/components/public/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { PERSONAL_EXPERIENCE_LABEL } from "@/lib/mentors/constants";
import {
  loadOpenQuestions,
  loadPublishedStoriesRecent,
  loadVerifiedMentors,
} from "@/lib/mentors/queries";
import { getVerifiedMentorCount, loadSoft } from "@/lib/public/queries";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "Mentor community",
  description:
    "Learn from Pakistani students who have been through international scholarship applications. Mentor experiences are personal stories, separate from official requirements.",
};

export default async function MentorsPage() {
  const count = await loadSoft(getVerifiedMentorCount);
  const publicClient = createPublicClient();
  const current = await getCurrentUser();
  // Admins should not see the student-facing "apply to become a mentor" CTA.
  const showApplyButton = !current || current.role !== "admin";

  let mentors: Awaited<ReturnType<typeof loadVerifiedMentors>> = [];
  let stories: Awaited<ReturnType<typeof loadPublishedStoriesRecent>> = [];
  let questions: Awaited<ReturnType<typeof loadOpenQuestions>> = [];

  if (publicClient && isSupabaseConfigured()) {
    [mentors, stories, questions] = await Promise.all([
      loadVerifiedMentors(publicClient, 30),
      loadPublishedStoriesRecent(publicClient, 12),
      loadOpenQuestions(publicClient, 15),
    ]);
  }

  return (
    <PageContainer className="space-y-10">
      <PageHeader
        title="Learn from Pakistani scholars"
        description="Verified mentors share journeys, timelines, and answers. Their content is personal experience — not official requirements."
      />

      <section aria-labelledby="official-vs-personal" className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 border-l-2 border-primary pl-4">
          <h2 id="official-vs-personal" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> Official requirements
          </h2>
          <p className="text-sm text-muted-foreground">
            Eligibility, deadlines and documents come from the official scholarship provider and are shown on
            each scholarship page with their sources.
          </p>
        </div>
        <div className="space-y-2 border-l-2 pl-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="size-4" aria-hidden /> Mentor experience
          </h2>
          <p className="text-sm text-muted-foreground">{PERSONAL_EXPERIENCE_LABEL}</p>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        {showApplyButton ? (
          <Button asChild>
            <Link href="/mentor/apply">Apply to become a mentor</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/scholarships">Explore scholarships</Link>
        </Button>
      </div>

      {count && count > 0 ? (
        <p className="text-sm text-muted-foreground">
          {count} verified {count === 1 ? "scholar has" : "scholars have"} joined.
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Verified mentors</h2>
        {!mentors || mentors.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No verified mentors yet"
            description="Every mentor's scholarship claim is reviewed before their profile is shown."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {mentors.map((m) => (
              <li key={m.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      <Link href={`/mentors/${m.id}`} className="hover:underline">
                        {m.field || "Scholar"} {m.degreeLevel ? `· ${m.degreeLevel}` : ""}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {[m.universityName, m.countryName, m.awardYear].filter(Boolean).join(" · ") ||
                        "Verified scholar"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {m.storyCount} published {m.storyCount === 1 ? "story" : "stories"}
                    {m.scholarshipName ? ` · ${m.scholarshipName}` : ""}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Recent stories</h2>
        {!stories || stories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Published stories will appear here.</p>
        ) : (
          <ul className="space-y-4">
            {stories.map((s) => (
              <li key={s.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/mentors/${s.mentorId}`} className="font-medium hover:underline">
                    {s.title}
                  </Link>
                  {s.mentorField ? <Badge variant="outline">{s.mentorField}</Badge> : null}
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{s.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">{PERSONAL_EXPERIENCE_LABEL}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Community questions</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ask a question</CardTitle>
            <CardDescription>Sign in required. Mentors answer from personal experience only.</CardDescription>
          </CardHeader>
          <CardContent>
            <AskQuestionForm />
          </CardContent>
        </Card>
        {!questions || questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open questions yet.</p>
        ) : (
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q.id} className="rounded-md border p-3">
                <p className="font-medium">{q.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{q.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
