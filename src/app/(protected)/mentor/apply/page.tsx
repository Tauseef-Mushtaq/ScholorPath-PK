import type { Metadata } from "next";
import Link from "next/link";

import { ApplyMentorForm, WithdrawMentorButton } from "@/components/mentors/mentor-forms";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { verificationLabel } from "@/lib/mentors/constants";
import { loadOwnMentorClaim } from "@/lib/mentors/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Become a mentor" };

export default async function MentorApplyPage() {
  const { user } = await requireUser();
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Mentor applications are temporarily unavailable.</p>
      </PageContainer>
    );
  }

  const supabase = await createClient();
  const claim = await loadOwnMentorClaim(supabase, user.id);

  return (
    <PageContainer className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Become a mentor</h1>
        <p className="mt-2 text-muted-foreground">
          Share your scholarship journey with other Pakistani students. Claims are verified before public
          stories appear.
        </p>
      </div>

      {claim === "error" ? (
        <p className="text-muted-foreground">Could not load your application status. Try again later.</p>
      ) : claim ? (
        <Card>
          <CardHeader>
            <CardTitle>Your application</CardTitle>
            <CardDescription>Status is controlled by admins after review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Status: <Badge variant="outline">{verificationLabel(claim.verificationStatus)}</Badge>
            </p>
            {claim.field ? <p>Field: {claim.field}</p> : null}
            {claim.degreeLevel ? <p>Degree: {claim.degreeLevel}</p> : null}
            {claim.awardYear ? <p>Award year: {claim.awardYear}</p> : null}
            {claim.verificationStatus === "verified" ? (
              <p>
                <Link href="/mentor/dashboard" className="text-primary underline-offset-4 hover:underline">
                  Open mentor dashboard
                </Link>
              </p>
            ) : claim.verificationStatus === "pending" ? (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  Waiting for admin verification of your scholarship claim.
                </p>
                <WithdrawMentorButton />
              </div>
            ) : (
              <p className="text-muted-foreground">
                Application was rejected. Contact support if you believe this is a mistake.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Apply</CardTitle>
            <CardDescription>
              Only claim scholarships you actually received. False claims will be rejected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApplyMentorForm />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
