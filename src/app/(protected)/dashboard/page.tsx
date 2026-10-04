import type { Metadata } from "next";

import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user, role } = await requireUser();

  return (
    <PageContainer>
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <Card className="mt-6 max-w-2xl">
        <CardHeader>
          <CardTitle>You&apos;re signed in</CardTitle>
          <CardDescription>
            Placeholder page. The real dashboard is built in a later module.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Email: {user.email}</p>
          <p>Role: {role}</p>
        </CardContent>
      </Card>
      {role === "admin" ? (
        <Card className="mt-4 max-w-2xl">
          <CardHeader>
            <CardTitle>Scholarship administration</CardTitle>
            <CardDescription>Create, edit, publish and archive scholarships.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link href="/admin/scholarships">Manage scholarships</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <Card className="mt-4 max-w-2xl">
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Add your education and experience so scholarships can be matched to you later.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link href="/profile">Go to my profile</Link>
          </Button>
        </CardContent>
      </Card>
      <Card className="mt-4 max-w-2xl">
        <CardHeader>
          <CardTitle>Your matches</CardTitle>
          <CardDescription>See which scholarships fit your profile and what is still missing.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link href="/matches">View my matches</Link>
          </Button>
        </CardContent>
      </Card>
      <Card className="mt-4 max-w-2xl">
        <CardHeader>
          <CardTitle>Your documents</CardTitle>
          <CardDescription>Keep your application documents in one private place.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link href="/documents">Go to my documents</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4 max-w-2xl">
        <CardHeader>
          <CardTitle>Your applications</CardTitle>
          <CardDescription>Track status, tasks, notes and deadlines for scholarships you are working on.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link href="/applications">Go to applications</Link>
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
