import Link from "next/link";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/scholarships", label: "Scholarships" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/rag", label: "RAG" },
  { href: "/admin/mentors", label: "Mentors" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminNav({ current }: { current?: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b pb-3 text-sm" aria-label="Admin">
      {LINKS.map((l) => {
        const active = current === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? "rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground"
                : "rounded-md px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
