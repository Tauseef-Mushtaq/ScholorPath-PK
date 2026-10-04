"use client";

import { Upload } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { SelectField } from "@/components/profile/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadDocument } from "@/lib/documents/actions";
import { ACCEPT_ATTRIBUTE, DOCUMENT_TYPES, MAX_FILE_SIZE_LABEL, SUPPORTED_FORMATS_LABEL } from "@/lib/documents/constants";
import type { DocumentFormState } from "@/lib/documents/types";
import { precheckFile } from "@/lib/documents/validation";

/**
 * The browser sends only the file and an optional allow-listed document type. The server decides the
 * owner, the real file type and the storage path. The checks here are convenience only.
 */
export function UploadForm() {
  const [state, formAction, pending] = useActionState<DocumentFormState, FormData>(uploadDocument, {});
  const [hasFile, setHasFile] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // Double-submit guard: a second submit while one is in flight is cancelled before it reaches the server.
  const inFlight = useRef(false);
  useEffect(() => {
    if (!pending) inFlight.current = false;
  }, [pending]);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border bg-card p-6"
      aria-label="Upload a document"
      onSubmit={(e) => {
        if (inFlight.current) {
          e.preventDefault();
          return;
        }
        inFlight.current = true;
      }}
      // React clears uncontrolled fields after an action finishes; keep our state in step.
      onReset={() => {
        setHasFile(false);
        setClientError(null);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="doc-file">Choose a file</Label>
        <Input
          id="doc-file"
          name="file"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          required
          disabled={pending}
          aria-describedby="doc-file-help"
          aria-invalid={clientError ? true : undefined}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setHasFile(Boolean(f));
            setClientError(f ? precheckFile(f) : null);
          }}
        />
        <p id="doc-file-help" className="text-xs text-muted-foreground">
          Supported formats: {SUPPORTED_FORMATS_LABEL}. Maximum size: {MAX_FILE_SIZE_LABEL}.
        </p>
      </div>

      <SelectField id="doc-type" name="document_type" label="Document type" options={DOCUMENT_TYPES} />

      <FormMessage error={clientError ?? undefined} />
      <FormMessage error={state.error} success={state.success} />

      <Button type="submit" disabled={pending || !hasFile || Boolean(clientError)}>
        <Upload className="size-4" aria-hidden />
        {pending ? "Uploading…" : "Upload document"}
      </Button>
    </form>
  );
}
