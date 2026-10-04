import {
  BookMarked,
  ClipboardList,
  Database,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/auth/roles";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Highlight only on an exact path match (e.g. the dashboard home). */
  exact?: boolean;
};
export type DashboardNavGroup = { label?: string; items: DashboardNavItem[] };

const studentTools: DashboardNavItem[] = [
  { href: "/matches", label: "Matches", icon: Sparkles },
  { href: "/profile", label: "Profile", icon: UserCircle },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/applications", label: "Applications", icon: ClipboardList },
];

/** Sidebar links per role. Display only; access is enforced by the proxy and requireRole(). */
export const dashboardNav: Record<Role, { title: string; groups: DashboardNavGroup[] }> = {
  student: {
    title: "Student",
    groups: [
      {
        items: [
          { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
          ...studentTools,
        ],
      },
      { label: "Community", items: [{ href: "/mentor/apply", label: "Become a mentor", icon: UserCheck }] },
    ],
  },
  mentor: {
    title: "Mentor",
    groups: [
      {
        label: "Mentor",
        items: [
          { href: "/mentor/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
          { href: "/mentor/apply", label: "My mentor profile", icon: UserCheck },
        ],
      },
      { label: "Student tools", items: studentTools },
    ],
  },
  admin: {
    title: "Admin",
    groups: [
      { items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true }] },
      {
        label: "Content",
        items: [
          { href: "/admin/scholarships", label: "Scholarships", icon: GraduationCap },
          { href: "/admin/sources", label: "Sources", icon: BookMarked },
          { href: "/admin/rag", label: "RAG", icon: Database },
        ],
      },
      {
        label: "People",
        items: [
          { href: "/admin/mentors", label: "Mentors", icon: UserCheck },
          { href: "/admin/users", label: "Users", icon: Users },
        ],
      },
      {
        label: "Moderation",
        items: [
          { href: "/admin/reports", label: "Reports", icon: ShieldAlert },
          { href: "/admin/audit", label: "Audit log", icon: ScrollText },
        ],
      },
      { label: "System", items: [{ href: "/admin/settings", label: "Settings", icon: Settings }] },
    ],
  },
};

