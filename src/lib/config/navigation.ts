/**
 * Public navigation. Only routes that exist in the app belong here (no placeholder links).
 * `/#how-it-works` is an in-page anchor on the landing page.
 */
export const publicNav = [
  { href: "/scholarships", label: "Scholarships" },
  { href: "/countries", label: "Countries" },
  { href: "/mentors", label: "Mentors" },
  { href: "/#how-it-works", label: "How it works" },
] as const;
