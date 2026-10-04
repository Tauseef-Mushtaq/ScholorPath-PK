import type { Metadata } from "next";

import { CompletionCard } from "@/components/profile/completion-card";
import { EducationSection } from "@/components/profile/education-section";
import { ExperienceSection } from "@/components/profile/experience-section";
import { ProfileForm } from "@/components/profile/profile-form";
import { EmptyState } from "@/components/public/states";
import { PageContainer } from "@/components/layout/page-container";
import { requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { computeCompletion } from "@/lib/profile/completion";
import { loadOwnProfile } from "@/lib/profile/queries";
import { createClient } from "@/lib/supabase/server";
import { DatabaseZap } from "lucide-react";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  // Identity comes from the server session only (never from the URL or the browser).
  const { user } = await requireUser();
  const data = isSupabaseConfigured() ? await loadOwnProfile(await createClient(), user.id) : null;

  return (
    <PageContainer className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">My profile</h1>
        <p className="text-muted-foreground">
          Keep your academic details up to date. Later, scholarship matching will use them to check your eligibility.
        </p>
      </header>

      {!data ? (
        <EmptyState
          icon={DatabaseZap}
          title="Your profile is temporarily unavailable"
          description="We couldn't load your profile right now. Please try again in a little while."
        />
      ) : (
        <>
          <CompletionCard completion={computeCompletion(data.profile, data.education, data.experiences)} />
          <ProfileForm profile={data.profile} />
          <EducationSection items={data.education} />
          <ExperienceSection items={data.experiences} />
        </>
      )}
    </PageContainer>
  );
}
