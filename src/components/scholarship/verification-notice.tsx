import { Info } from "lucide-react";

import { verificationState } from "@/lib/public/detail";
import { cn } from "@/lib/utils";

/**
 * Says how fresh the information is. A scholarship that was never verified (or whose date is
 * unusable) is shown as UNCONFIRMED; a recent date still only says "last verified".
 */
export function VerificationNotice({ lastVerifiedAt, today }: { lastVerifiedAt: string | null; today: string }) {
  const v = verificationState(lastVerifiedAt, today);
  const warn = v.kind !== "recent";
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        warn ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100" : "bg-muted/40",
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-medium">
          {v.kind === "never" ? "Not verified yet. " : v.kind === "stale" ? "Information may be out of date. " : "Verification. "}
        </span>
        {v.message}
      </p>
    </div>
  );
}
