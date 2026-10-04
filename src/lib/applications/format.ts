/** Display helpers for Application Workspace (pure). */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function deadlineLabel(deadline: string | null, todayIso: string): string {
  if (!deadline) return "Deadline not listed";
  if (deadline < todayIso) return `Deadline passed (${formatDate(deadline)})`;
  if (deadline === todayIso) return "Deadline is today";
  return `Deadline ${formatDate(deadline)}`;
}

export function todayIsoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
