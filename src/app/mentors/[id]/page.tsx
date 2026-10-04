import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AskQuestionForm } from "@/components/mentors/mentor-forms";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";
import { PERSONAL_EXPERIENCE_LABEL } from "@/lib/mentors/constants";
import {
  loadPublishedAnswersForMentor,
  loadPublishedStoriesForMentor,
  loadTimelineForMentor,
  loadVerifiedMentorById,
} from "@/lib/mentors/queries";
import { isUuid } from "@/lib/mentors/validation";
import { createPublicClient } from "@/lib/supabase/public";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: "Mentor profile" };
}

export default async function MentorDetailPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Mentor profiles are temporarily unavailable.</p>
      </PageContainer>
    );
  }

  const client = createPublicClient();
  if (!client) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Mentor profiles are temporarily unavailable.</p>
      </PageContainer>
    );
  }

  const mentor = await loadVerifiedMentorById(client, id);
  if (mentor === "error") {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Could not load this mentor. Try again later.</p>
      </PageContainer>
    );
  }
  if (!mentor) notFound();

  const [stories, timeline, answers] = await Promise.all([
    loadPublishedStoriesForMentor(client, id),
    loadTimelineForMentor(client, id),
    loadPublishedAnswersForMentor(client, id),
  ]);

  return (
    <PageContainer className="max-w-3xl space-y-8">
      <div>
        <Link href="/mentors" className="text-sm text-muted-foreground hover:text-foreground">
          ← All mentors
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {mentor.field || "Verified scholar"}
          {mentor.degreeLevel ? ` · ${mentor.degreeLevel}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {[mentor.universityName, mentor.countryName, mentor.awardYear].filter(Boolean).join(" · ")}
        </p>
        {mentor.scholarshipName ? (
          <p className="mt-1 text-sm">Scholarship: {mentor.scholarshipName}</p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">{PERSONAL_EXPERIENCE_LABEL}</p>
      </div>

      {timeline && timeline.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {timeline.map((t) => (
                <li key={t.id}>
                  <span className="font-medium">{t.title}</span>
                  {t.dateOrPeriod ? (
                    <span className="text-muted-foreground"> · {t.dateOrPeriod}</span>
                  ) : null}
                  {t.description ? <p className="text-muted-foreground">{t.description}</p> : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Stories</h2>
        {!stories || stories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published stories yet.</p>
        ) : (
          stories.map((s) => (
            <article key={s.id} className="rounded-md border p-4">
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">{PERSONAL_EXPERIENCE_LABEL}</p>
            </article>
          ))
        )}
      </section>

      {answers && answers.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Answers</h2>
          {answers.map((a) => (
            <div key={a.id} className="rounded-md border p-4">
              {a.question ? <p className="font-medium">Q: {a.question}</p> : null}
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{a.answer}</p>
              <Badge variant="outline" className="mt-2">
                Personal experience
              </Badge>
            </div>
          ))}
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Ask this mentor</CardTitle>
          <CardDescription>Requires sign-in. Answers are personal experience only.</CardDescription>
        </CardHeader>
        <CardContent>
          <AskQuestionForm mentorId={id} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
