"use server";

import { redirect } from "next/navigation";

import { getAppUrl, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { fetchUserRole } from "./roles";
import { DEFAULT_AUTHENTICATED_PATH, LOGIN_PATH, roleHomePath, safeRedirectPath } from "./routes";
import type { AuthFormState } from "./types";
import { normalizeEmail, validateEmail, validateNewPassword } from "./validation";

const NOT_CONFIGURED: AuthFormState = {
  error: "Authentication is not configured on this server yet. Please try again later.",
};
const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";

type AuthErrorLike = { code?: string; status?: number; message?: string };

function isRateLimit(e: AuthErrorLike) {
  return e.status === 429 || e.code === "over_request_rate_limit" || e.code === "over_email_send_rate_limit";
}

function logAuthError(action: string, e: AuthErrorLike) {
  // Log the code only: never emails, passwords or tokens.
  console.error(`[auth:${action}]`, e.code ?? e.status ?? "unknown_error");
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: NonNullable<AuthFormState["fieldErrors"]> = {
    email: validateEmail(email),
    ...validateNewPassword(password, confirmPassword),
  };
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors, email };
  if (!isSupabaseConfigured()) return { ...NOT_CONFIGURED, email };

  const supabase = await createClient();
  // NOTE: no role/metadata is sent. Roles are never accepted from the client.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${getAppUrl()}/auth/callback?next=${DEFAULT_AUTHENTICATED_PATH}` },
  });

  if (error) {
    logAuthError("signUp", error);
    if (isRateLimit(error)) return { error: RATE_LIMITED, email };
    if (error.code === "weak_password") {
      return { fieldErrors: { password: "Password is too weak. Try a longer or less common one." }, email };
    }
    if (error.code === "user_already_exists") {
      return {
        error: "We couldn't create that account. If you already registered, log in or reset your password.",
        email,
      };
    }
    return { error: GENERIC_ERROR, email };
  }

  // A session exists only when the project does not require email confirmation.
  if (data.session) redirect(DEFAULT_AUTHENTICATED_PATH);

  return {
    success: "Check your email for a confirmation link to finish creating your account.",
    email,
  };
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  const fieldErrors: NonNullable<AuthFormState["fieldErrors"]> = {
    email: validateEmail(email),
    password: password ? undefined : "Password is required.",
  };
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors, email };
  if (!isSupabaseConfigured()) return { ...NOT_CONFIGURED, email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logAuthError("login", error);
    if (isRateLimit(error)) return { error: RATE_LIMITED, email };
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email address first. Check your inbox for the link.", email };
    }
    if (error.code === "invalid_credentials") return { error: "Invalid email or password.", email };
    return { error: GENERIC_ERROR, email };
  }

  // No explicit `next`: send each role to its own dashboard. Role comes from public.profiles
  // (own row, user session); a failed lookup falls back to the student dashboard.
  const role = (data.user ? await fetchUserRole(supabase, data.user.id) : null) ?? "student";
  redirect(safeRedirectPath(formData.get("next"), roleHomePath(role)));
}

export async function logout() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) logAuthError("logout", error);
  }
  redirect(LOGIN_PATH);
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const emailError = validateEmail(email);
  if (emailError) return { fieldErrors: { email: emailError }, email };
  if (!isSupabaseConfigured()) return { ...NOT_CONFIGURED, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password`,
  });

  if (error) {
    logAuthError("resetRequest", error);
    if (isRateLimit(error)) return { error: RATE_LIMITED, email };
    // Other failures fall through to the same message so account existence is never revealed.
  }

  return {
    success: "If an account exists for that email, a password reset link is on its way.",
    email,
  };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors = validateNewPassword(password, confirmPassword);
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors };
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const supabase = await createClient();
  // Server-side check: a valid (recovery or normal) session must exist.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: "Your reset link is invalid or has expired. Please request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    logAuthError("updatePassword", error);
    if (isRateLimit(error)) return { error: RATE_LIMITED };
    if (error.code === "same_password") {
      return { fieldErrors: { password: "New password must be different from your old one." } };
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: "Password is too weak. Try a longer or less common one." } };
    }
    return { error: GENERIC_ERROR };
  }

  redirect(DEFAULT_AUTHENTICATED_PATH);
}
