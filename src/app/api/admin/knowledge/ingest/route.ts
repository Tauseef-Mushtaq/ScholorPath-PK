import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { KNOWLEDGE_CONFIG } from "@/lib/knowledge/config";
import { ingestEligibleBatch, ingestSourceById } from "@/lib/knowledge/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only ingestion trigger (Module 11). Body: { "sourceId": "<uuid>" } or { "eligible": true, "limit": 1..10 }.
 * Never accepts a URL from the caller: sources are read from scholarship_sources by id, then validated.
 * Responses contain status codes only — never fetched content, URLs, keys or database errors.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: "unavailable" }, 503);

  // CSRF defence in depth: JSON content type (forces a CORS preflight cross-site) + same-origin check.
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "unsupported_media_type" }, 415);
  // Compare hosts (not full origins): behind a proxy `request.url` may carry an internal scheme/host.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    let originHost: string | null = null;
    try { originHost = new URL(origin).host; } catch { /* malformed Origin is rejected below */ }
    if (!originHost || !host || originHost !== host) return json({ error: "forbidden" }, 403);
  }

  const current = await getCurrentUser();
  if (!current) return json({ error: "unauthenticated" }, 401);
  if (current.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "invalid_body" }, 400);
  const b = body as Record<string, unknown>;

  try {
    if (typeof b.sourceId === "string") {
      if (!UUID.test(b.sourceId)) return json({ error: "invalid_body" }, 400);
      return json({ result: await ingestSourceById(b.sourceId) }, 200);
    }
    if (b.eligible === true) {
      const limit = typeof b.limit === "number" && Number.isInteger(b.limit) ? b.limit : 1;
      if (limit < 1 || limit > KNOWLEDGE_CONFIG.ingestion.maxBatch) return json({ error: "invalid_body" }, 400);
      const out = await ingestEligibleBatch(limit);
      return out ? json(out, 200) : json({ error: "unavailable" }, 503);
    }
  } catch {
    return json({ error: "ingestion_failed" }, 500);
  }
  return json({ error: "invalid_body" }, 400);
}
