"use client";

import { Button } from "@/components/ui/button";

const DEMO_ACCOUNTS = [
  { role: "Student", email: "student@gmail.com", password: "student123" },
  { role: "Mentor", email: "mentor@gmail.com", password: "mentor123" },
  { role: "Admin", email: "admin@gmail.com", password: "admin123" },
] as const;

function setField(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  // Use the native setter so the value sticks for uncontrolled React inputs.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Hackathon demo helper: lists the judge/test accounts and fills the form on click. */
export function DemoCredentials() {
  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
      <p className="font-semibold">Demo accounts (for judges)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Log in with one of these to review each role&apos;s dashboard.
      </p>
      <ul className="mt-3 space-y-2">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.role} className="flex items-center justify-between gap-2 rounded-md bg-background p-2">
            <div className="min-w-0">
              <p className="font-medium">As a {a.role}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="select-all">{a.email}</span> / <span className="select-all">{a.password}</span>
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setField("email", a.email);
                setField("password", a.password);
              }}
            >
              Fill
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
