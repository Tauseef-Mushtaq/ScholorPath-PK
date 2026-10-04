import { ROLES, type Role } from "./roles";

/** Where users land after login/signup (see docs/PAGES_AUTHORIZATION.md). */
export const DEFAULT_AUTHENTICATED_PATH = "/dashboard";
export const LOGIN_PATH = "/login";

/**
 * Route prefixes that require authentication.
 * NOTE: `/mentors` and `/mentors/[id]` are PUBLIC per docs/PAGES_AUTHORIZATION.md;
 * only the singular `/mentor/*` area is protected.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/documents",
  "/matches",
  "/applications",
  "/ai",
  "/mentor",
  "/admin",
] as const;

/** Most specific first. Paths not listed only need authentication. */
const ROLE_RULES: ReadonlyArray<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/mentor/apply", roles: ["student", "mentor", "admin"] },
  { prefix: "/mentor", roles: ["mentor", "admin"] },
  { prefix: "/admin", roles: ["admin"] },
];

/** Pages that signed-in users should not see (redirected to the dashboard). */
const GUEST_ONLY_PATHS = ["/login", "/signup"] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

export function isGuestOnlyPath(pathname: string) {
  return GUEST_ONLY_PATHS.some((p) => matchesPrefix(pathname, p));
}

export function isRoleAllowed(pathname: string, role: Role) {
  const rule = ROLE_RULES.find((r) => matchesPrefix(pathname, r.prefix));
  return rule ? rule.roles.includes(role) : true;
}

/** True when the path is restricted to a subset of roles (so the proxy must look up the role). */
export function requiresRoleCheck(pathname: string) {
  const rule = ROLE_RULES.find((r) => matchesPrefix(pathname, r.prefix));
  return !!rule && rule.roles.length < ROLES.length;
}

/**
 * Only allow same-site relative redirects (prevents open redirects).
 * Returns `fallback` for anything else.
 */
export function safeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback: string = DEFAULT_AUTHENTICATED_PATH,
) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
