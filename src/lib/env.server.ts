import "server-only";

/** Server-only secrets. Importing this file from a Client Component fails the build. */

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Missing environment variable SUPABASE_SERVICE_ROLE_KEY.");
  }
  return key;
}

/** Reserved for the AI modules (ADR-003 / ADR-004). Optional until then. */
export function getAiKeys() {
  return {
    gemini: process.env.GEMINI_API_KEY,
    grok: process.env.GROK_API_KEY,
  };
}
