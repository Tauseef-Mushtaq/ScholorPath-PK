import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { DatabaseZap, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? (
        <Button asChild variant="outline" size="sm">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** Shown when Supabase is not configured in this environment (never shows raw errors). */
export function UnavailableState() {
  return (
    <EmptyState
      icon={DatabaseZap}
      title="This information is temporarily unavailable"
      description="We couldn't load scholarship data right now. Please try again in a little while."
    />
  );
}
