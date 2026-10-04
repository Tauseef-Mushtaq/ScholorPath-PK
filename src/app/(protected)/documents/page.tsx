import type { Metadata } from "next";
import { DatabaseZap, FolderOpen, Lock } from "lucide-react";

import { DocumentList } from "@/components/documents/document-list";
import { UploadForm } from "@/components/documents/upload-form";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/public/states";
import { requireUser } from "@/lib/auth/session";
import { loadOwnDocuments } from "@/lib/documents/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My documents" };

export default async function DocumentsPage() {
  // Identity comes from the server session only (never from the URL or the browser).
  const { user } = await requireUser();
  const documents = isSupabaseConfigured() ? await loadOwnDocuments(await createClient(), user.id) : null;

  return (
    <PageContainer className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">My documents</h1>
        <p className="text-muted-foreground">
          Keep the documents you may need for scholarship and application preparation in one private place.
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Your documents are private. Only you can see, open or delete them while you are signed in.</span>
        </p>
      </header>

      <section aria-labelledby="upload-heading" className="space-y-3">
        <h2 id="upload-heading" className="text-lg font-semibold">Upload a document</h2>
        <UploadForm />
      </section>

      <section aria-labelledby="list-heading" className="space-y-3">
        <h2 id="list-heading" className="text-lg font-semibold">Your documents</h2>
        {documents === null ? (
          <EmptyState
            icon={DatabaseZap}
            title="Your documents are temporarily unavailable"
            description="We couldn't load your documents right now. Please try again in a little while."
          />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No documents yet"
            description="Upload your first document above. It will appear here, private to you."
          />
        ) : (
          <DocumentList documents={documents} />
        )}
      </section>
    </PageContainer>
  );
}
