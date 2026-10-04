"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  adminSetMentorVerification,
  addTimelineItem,
  answerQuestion,
  applyToBeMentor,
  askMentorQuestion,
  createStory,
  withdrawMentorApplication,
} from "@/lib/mentors/actions";
import type { MentorFormState } from "@/lib/mentors/types";

const initial: MentorFormState = {};

function FormMessage({ state }: { state: MentorFormState }) {
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p className="text-sm text-emerald-700 dark:text-emerald-300">{state.success}</p>;
  return null;
}

export function WithdrawMentorButton() {
  const [state, action, pending] = useActionState(withdrawMentorApplication, initial);
  return (
    <form action={action} className="space-y-2">
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} variant="outline" size="sm">
        {pending ? "Withdrawing…" : "Withdraw application"}
      </Button>
    </form>
  );
}

export function ApplyMentorForm() {
  const [state, action, pending] = useActionState(applyToBeMentor, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="degreeLevel">Degree level awarded</Label>
        <Input id="degreeLevel" name="degreeLevel" placeholder="e.g. Master's" maxLength={100} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="field">Field of study</Label>
        <Input id="field" name="field" placeholder="e.g. Computer Science" maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="awardYear">Award year</Label>
        <Input id="awardYear" name="awardYear" type="number" min={1900} max={2100} placeholder="2024" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="scholarshipId">Scholarship id (optional UUID)</Label>
        <Input id="scholarshipId" name="scholarshipId" placeholder="From a published scholarship page" />
      </div>
      <p className="text-xs text-muted-foreground">
        Admin will verify your scholarship claim before your stories appear publicly. Do not invent awards.
      </p>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit mentor application"}
      </Button>
    </form>
  );
}

export function StoryForm() {
  const [state, action, pending] = useActionState(createStory, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">Story</Label>
        <Textarea id="body" name="body" required rows={8} maxLength={50000} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <select id="status" name="status" className="flex h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Stories are personal experience, not official requirements.
      </p>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save story"}
      </Button>
    </form>
  );
}

export function TimelineForm() {
  const [state, action, pending] = useActionState(addTimelineItem, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tl-title">Title</Label>
        <Input id="tl-title" name="title" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dateOrPeriod">Date or period</Label>
        <Input id="dateOrPeriod" name="dateOrPeriod" placeholder="e.g. 2023–2024" maxLength={100} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} maxLength={4000} />
      </div>
      <input type="hidden" name="sortOrder" value="0" />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add timeline entry"}
      </Button>
    </form>
  );
}

export function AskQuestionForm({ mentorId }: { mentorId?: string }) {
  const [state, action, pending] = useActionState(askMentorQuestion, initial);
  return (
    <form action={action} className="space-y-4">
      {mentorId ? <input type="hidden" name="mentorId" value={mentorId} /> : null}
      <div className="space-y-2">
        <Label htmlFor="q-title">Question title</Label>
        <Input id="q-title" name="title" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="q-body">Details</Label>
        <Textarea id="q-body" name="body" required rows={4} maxLength={4000} />
      </div>
      <p className="text-xs text-muted-foreground">
        Answers are personal experience from mentors — always check official scholarship sources.
      </p>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Posting…" : "Ask question"}
      </Button>
    </form>
  );
}

export function AnswerForm({ questionId, questionText }: { questionId?: string; questionText?: string }) {
  const [state, action, pending] = useActionState(answerQuestion, initial);
  return (
    <form action={action} className="space-y-4">
      {questionId ? <input type="hidden" name="questionId" value={questionId} /> : null}
      {questionText ? <input type="hidden" name="question" value={questionText} /> : null}
      <div className="space-y-2">
        <Label htmlFor="answer">Your answer (personal experience)</Label>
        <Textarea id="answer" name="answer" required rows={5} maxLength={20000} />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Publishing…" : "Publish answer"}
      </Button>
    </form>
  );
}

export function AdminVerifyButtons({ mentorId }: { mentorId: string }) {
  const [state, action, pending] = useActionState(adminSetMentorVerification, initial);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="mentorId" value={mentorId} />
          <input type="hidden" name="status" value="verified" />
          <Button type="submit" disabled={pending} size="sm">
            Verify
          </Button>
        </form>
        <form action={action}>
          <input type="hidden" name="mentorId" value={mentorId} />
          <input type="hidden" name="status" value="rejected" />
          <Button type="submit" disabled={pending} size="sm" variant="outline">
            Reject
          </Button>
        </form>
        <form action={action}>
          <input type="hidden" name="mentorId" value={mentorId} />
          <input type="hidden" name="status" value="pending" />
          <Button type="submit" disabled={pending} size="sm" variant="ghost">
            Reset pending
          </Button>
        </form>
      </div>
      <FormMessage state={state} />
    </div>
  );
}
