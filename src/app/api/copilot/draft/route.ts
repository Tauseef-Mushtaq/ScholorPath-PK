import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { generateDraftForUser } from "@/lib/copilot/service.server";

export const runtime = "nodejs";

/**
 * POST /api/copilot/draft — generate SOP/essay/etc. for an owned application.
 * Session required. No service role. Body: { applicationId, draftType, question?, extraInstructions?, existingContent? }
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      const o = new URL(origin);
      if (o.host !== host) {
        return NextResponse.json({ ok: false, code: "unauthorized", message: "Invalid origin." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false, code: "unauthorized", message: "Invalid origin." }, { status: 403 });
    }
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ ok: false, code: "unauthorized", message: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "validation_error", message: "Invalid JSON." }, { status: 400 });
  }

  const result = await generateDraftForUser({
    supabase,
    userId: auth.user.id,
    body,
  });

  if (!result.ok) {
    const status =
      result.code === "unauthorized"
        ? 401
        : result.code === "not_found"
          ? 404
          : result.code === "validation_error" || result.code === "profile_missing"
            ? 400
            : result.code === "generation_unavailable"
              ? 503
              : 500;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
