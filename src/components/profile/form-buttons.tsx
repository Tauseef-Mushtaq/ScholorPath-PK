"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function SaveButton({ children = "Save", pendingText = "Saving…" }: { children?: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}
