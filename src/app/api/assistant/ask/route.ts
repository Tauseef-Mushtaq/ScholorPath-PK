import { NextResponse } from "next/server";

import { askAssistant } from "@/lib/assistant/service.server";
import { validateAskBody } from "@/lib/assistant/validate";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scholarship Q&A (Module 12). Body: { "scholarshipId": "<uuid>", "question": "<text>" }.
 * Signed-in users only. The scholarship must be visible to the caller under RLS (draft/archived/missing => 404).
 * Never accepts a URL: sources come only from Module 11 retrieval. Responses never include keys, prompts or raw errors.
 */
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: "unavailable" }, 503);

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "unsupported_media_type" }, 415);
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    let originHost: string | null = null;
    try { originHost = new URL(origin).host; } catch { /* rejected below */ }
    if (!originHost || !host || originHost !== host) return json({ error: "forbidden" }, 403);
  }

  const current = await getCurrentUser();
  if (!current) return json({ error: "unauthenticated" }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_body" }, 400); }
  const v = validateAskBody(body);
  if (!v.ok) return json({ error: "invalid_body" }, 400);

  try {
    // Authorization: RLS decides whether this user can see the scholarship (no status logic in app code).
    const supabase = await createClient();
    const { data, error } = await supabase.from("scholarships").select("id").eq("id", v.value.scholarshipId).maybeSingle();
    if (error) return json({ error: "unavailable" }, 503);
    if (!data) return json({ error: "not_found" }, 404);

    const result = await askAssistant(v.value);
    if (result.ok) return json(result, 200);
    if (result.code === "invalid_request") return json({ error: "invalid_body" }, 400);
    return json({ error: result.code === "unavailable" ? "unavailable" : "assistant_failed" }, result.code === "unavailable" ? 503 : 502);
  } catch {
    return json({ error: "assistant_failed" }, 500);
  }
}
