import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { siteConfig } from "@/lib/config/site";

const columns = [
  {
    title: "Explore",
    links: [
      { href: "/scholarships", label: "Scholarships" },
      { href: "/countries", label: "Countries" },
      { href: "/mentors", label: "Mentors" },
    ],
  },
  {
    title: "ScholarPath",
    links: [{ href: "/#how-it-works", label: "How it works" }],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Log in" },
      { href: "/signup", label: "Sign up" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <GraduationCap className="size-5 text-primary" aria-hidden />
            {siteConfig.name}
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">
            Helping Pakistani students find, prepare for and track international scholarships.
          </p>
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="mb-3 text-sm font-semibold">{col.title}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {siteConfig.name}. ScholarPath is a guide, not the scholarship provider.
          Always confirm deadlines and requirements on the official scholarship source before you apply.
        </p>
      </div>
    </footer>
  );
}
