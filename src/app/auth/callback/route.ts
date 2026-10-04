import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_PATH, safeRedirectPath } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly string[] = ["signup", "recovery", "email", "invite", "magiclink", "email_change"];

/**
 * Handles Supabase email links (signup confirmation, password recovery).
 * Supports the PKCE `code` flow and the `token_hash` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeRedirectPath(searchParams.get("next"));

  const fail = () => NextResponse.redirect(`${origin}${LOGIN_PATH}?error=link_invalid`);

  if (!isSupabaseConfigured()) return fail();
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("[auth:callback]", error.code ?? error.status ?? "exchange_failed");
    return fail();
  }

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) {
      const target = type === "recovery" ? "/reset-password" : next;
      return NextResponse.redirect(`${origin}${target}`);
    }
    console.error("[auth:callback]", error.code ?? error.status ?? "verify_failed");
  }

  return fail();
}
