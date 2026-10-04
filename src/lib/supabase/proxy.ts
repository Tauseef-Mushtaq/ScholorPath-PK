import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { fetchUserRole } from "@/lib/auth/roles";
import {
  DEFAULT_AUTHENTICATED_PATH,
  LOGIN_PATH,
  isGuestOnlyPath,
  isProtectedPath,
  isRoleAllowed,
  requiresRoleCheck,
} from "@/lib/auth/routes";
import { getSupabasePublicEnv, isSupabaseConfigured } from "@/lib/env";

function redirectTo(
  request: NextRequest,
  pathname: string,
  sessionResponse: NextResponse,
  next?: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (next) url.searchParams.set("next", next);
  const redirect = NextResponse.redirect(url);
  // Preserve any refreshed session cookies / cache headers on the redirect.
  sessionResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  sessionResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "cache-control") redirect.headers.set(key, value);
  });
  return redirect;
}

/**
 * Refreshes the Supabase session cookies and applies route protection.
 * This is an OPTIMISTIC check; pages/actions still verify server-side
 * (`requireUser` / `requireRole`). Fails closed if Supabase is not configured.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return isProtectedPath(pathname) ? redirectTo(request, LOGIN_PATH, response) : response;
  }

  const { url, anonKey } = getSupabasePublicEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Verifies the JWT signature and refreshes the session if the token expired.
  // Do not run other logic between createServerClient and getClaims.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return isProtectedPath(pathname)
      ? redirectTo(request, LOGIN_PATH, response, `${pathname}${search}`)
      : response;
  }

  if (isGuestOnlyPath(pathname)) {
    return redirectTo(request, DEFAULT_AUTHENTICATED_PATH, response);
  }

  // Role-restricted areas (/admin, /mentor/* except /mentor/apply): optimistic check against
  // public.profiles using the user's own session (RLS: own row only). Pages still re-check with
  // requireRole(). Fails closed: a failed lookup or missing profile is treated as not allowed.
  // The role is NOT read from the JWT/app_metadata/user_metadata.
  if (isProtectedPath(pathname) && requiresRoleCheck(pathname)) {
    const role = await fetchUserRole(supabase, claims.sub);
    if (!role || !isRoleAllowed(pathname, role)) {
      return redirectTo(request, DEFAULT_AUTHENTICATED_PATH, response);
    }
  }

  return response;
}
