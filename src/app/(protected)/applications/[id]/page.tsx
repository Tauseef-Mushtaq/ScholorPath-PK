import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddTaskForm, NotesForm, StatusForm, TaskStatusSelect } from "@/components/applications/workspace-forms";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { ReviewPanel } from "@/components/review/review-panel";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { applicationStatusLabel, taskStatusLabel } from "@/lib/applications/constants";
import { deadlineLabel, formatDate, todayIsoDate } from "@/lib/applications/format";
import { loadOwnApplication } from "@/lib/applications/queries";
import { isUuid } from "@/lib/applications/validation";
import { loadDraftsForApplication } from "@/lib/copilot/queries";
import { loadApplicationHealth } from "@/lib/review/service.server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: "Application" };
}

export default async function ApplicationDetailPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { user } = await requireUser();
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Applications are temporarily unavailable.</p>
      </PageContainer>
    );
  }

  const supabase = await createClient();
  const detail = await loadOwnApplication(supabase, user.id, id);
  if (detail === "error") {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Applications are temporarily unavailable. Please try again later.</p>
      </PageContainer>
    );
  }
  if (!detail) notFound();

  const drafts = (await loadDraftsForApplication(supabase, detail.id)) ?? [];
  const health = await loadApplicationHealth(supabase, user.id, detail, drafts);

  const today = todayIsoDate();
  const s = detail.scholarship;
  const safeHttp = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);
  const applyUrl = safeHttp(s.officialApplicationUrl);
  const infoUrl = safeHttp(s.officialInfoUrl);

  return (
    <PageContainer>
      <div className="mb-6">
        <Link href="/applications" className="text-sm text-muted-foreground hover:text-foreground">
          ← All applications
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{s.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {s.provider}
            {s.countryName ? ` · ${s.countryName}` : ""} · {s.degreeLevel} · {s.fundingType.replace(/_/g, " ")}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {applicationStatusLabel(detail.status)}
        </Badge>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{deadlineLabel(s.deadline, today)}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/scholarships/${s.id}`}>Scholarship details</Link>
        </Button>
        {applyUrl ? (
          <Button asChild size="sm">
            <a href={applyUrl} target="_blank" rel="noopener noreferrer">
              Official application
            </a>
          </Button>
        ) : null}
        {infoUrl ? (
          <Button asChild size="sm" variant="ghost">
            <a href={infoUrl} target="_blank" rel="noopener noreferrer">
              Official info
            </a>
          </Button>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        You apply on the official website. ScholarPath does not submit applications for you.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status &amp; timeline</CardTitle>
            <CardDescription>Only you can change this status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <StatusForm applicationId={detail.id} status={detail.status} />
            <ul className="space-y-1 text-muted-foreground">
              <li>Created: {formatDate(detail.createdAt)}</li>
              <li>Started: {formatDate(detail.startedAt)}</li>
              <li>Submitted (recorded): {formatDate(detail.submittedAt)}</li>
              <li>Result date: {formatDate(detail.resultDate)}</li>
              <li>Last updated: {formatDate(detail.updatedAt)}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Private notes for this application.</CardDescription>
          </CardHeader>
          <CardContent>
            <NotesForm applicationId={detail.id} notes={detail.notes} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>
            Preparation checklist. Tasks may also be created by the scholarship agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet. Add one below or run the preparation agent.</p>
          ) : (
            <ul className="space-y-4">
              {detail.tasks.map((t) => (
                <li key={t.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {t.title}
                        {t.required ? (
                          <span className="ml-2 text-xs text-muted-foreground">required</span>
                        ) : (
                          <span className="ml-2 text-xs text-muted-foreground">optional</span>
                        )}
                      </p>
                      {t.description ? <p className="mt-1 text-sm text-muted-foreground">{t.description}</p> : null}
                      {t.dueDate ? <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(t.dueDate)}</p> : null}
                    </div>
                    <Badge variant="outline">{taskStatusLabel(t.status)}</Badge>
                  </div>
                  <div className="mt-2">
                    <TaskStatusSelect task={t} applicationId={detail.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <AddTaskForm applicationId={detail.id} />
        </CardContent>
      </Card>

      {detail.roadmap ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{detail.roadmap.title}</CardTitle>
            {detail.roadmap.summary ? <CardDescription>{detail.roadmap.summary}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {detail.roadmap.steps.map((step) => (
                <li key={step.id}>
                  <span className="font-medium">{step.title}</span>
                  {step.targetDate ? (
                    <span className="text-muted-foreground"> · target {formatDate(step.targetDate)}</span>
                  ) : null}
                  {step.description ? <p className="text-muted-foreground">{step.description}</p> : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          No preparation roadmap yet. Ask the agent to prepare you for this scholarship to generate one.
        </p>
      )}

      <CopilotPanel applicationId={detail.id} drafts={drafts} />

      <ReviewPanel health={health} />
    </PageContainer>
  );
}
