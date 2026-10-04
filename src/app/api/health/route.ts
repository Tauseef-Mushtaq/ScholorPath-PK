import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";

/** Reports configuration state only. Never returns secret values. */
export function GET() {
  return NextResponse.json({
    status: "ok",
    supabaseConfigured: isSupabaseConfigured(),
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    ),
    time: new Date().toISOString(),
  });
}
