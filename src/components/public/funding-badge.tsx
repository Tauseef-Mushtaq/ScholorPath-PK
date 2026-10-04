import { Badge } from "@/components/ui/badge";
import { FUNDING_LABELS } from "@/lib/public/format";
import type { FundingType } from "@/lib/public/types";

const VARIANT = { fully_funded: "default", partially_funded: "warning", not_funded: "muted" } as const;

export function FundingBadge({ type }: { type: FundingType }) {
  return <Badge variant={VARIANT[type]}>{FUNDING_LABELS[type]}</Badge>;
}
