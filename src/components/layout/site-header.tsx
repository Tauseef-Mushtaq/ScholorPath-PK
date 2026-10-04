import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { roleHomePath } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { publicNav } from "@/lib/config/navigation";
import { siteConfig } from "@/lib/config/site";

import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  const auth = await getAuthState();

  const authActions = auth.isAuthenticated ? (
    <>
      <Button asChild size="sm">
        <Link href={roleHomePath(auth.role)}>Dashboard</Link>
      </Button>
      <LogoutButton />
    </>
  ) : (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">Log in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/signup">Sign up</Link>
      </Button>
    </>
  );

  return (
    <header className="relative border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <GraduationCap className="size-5 text-primary" aria-hidden />
          {siteConfig.name}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {publicNav.map((link) => (
            <Button key={link.href} asChild variant="ghost" size="sm">
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">{authActions}</div>

        <MobileNav links={publicNav}>{authActions}</MobileNav>
      </div>
    </header>
  );
}
