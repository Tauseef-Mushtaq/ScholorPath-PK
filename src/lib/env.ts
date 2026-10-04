/**
 * Environment access.
 *
 * Public values are safe for the browser. NEXT_PUBLIC_* variables must be referenced
 * with a literal `process.env.NEXT_PUBLIC_X` so Next.js can inline them at build time.
 *
 * Secret values (service role key, AI keys) are read ONLY via the server-only
 * helpers in `env.server.ts`, which cannot be imported from client code.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and set it.`,
    );
  }
  return value;
}

export function getSupabasePublicEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Canonical site URL (used for email redirect links). Must be in Supabase's Redirect URL allow-list. */
export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
