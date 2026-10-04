"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Role } from "@/lib/auth/roles";
import { dashboardNav, type DashboardNavItem } from "@/lib/config/dashboard-nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, item: DashboardNavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Role-based dashboard navigation. Sidebar on md+; a horizontally scrollable strip on small screens.
 * Display only: access control stays in the proxy and requireRole().
 */
export function DashboardSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const { title, groups } = dashboardNav[role];
  const all = groups.flatMap((g) => g.items);

  return (
    <>
      {/* Mobile: scrollable strip */}
      <nav
        aria-label={`${title} navigation`}
        className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden"
      >
        {all.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: sidebar */}
      <aside className="hidden w-60 shrink-0 md:block">
        <nav
          aria-label={`${title} navigation`}
          className="sticky top-6 my-10 ml-4 space-y-5 rounded-lg border bg-card p-3"
        >
          <p className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title} area</p>
          {groups.map((group, i) => (
            <div key={group.label ?? i} className="space-y-1">
              {group.label ? (
                <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              ) : null}
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
