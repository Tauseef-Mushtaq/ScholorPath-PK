import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

// Auth-dependent: never prerender statically.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  // The recovery link (via /auth/callback) creates a session; no session = invalid/expired link.
  const current = await getCurrentUser();
  if (!current) redirect("/forgot-password?error=expired");

  return (
    <AuthCard title="Choose a new password" description="Enter a new password for your account.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
