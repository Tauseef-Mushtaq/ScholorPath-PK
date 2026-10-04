import { NextResponse } from "next/server";

import { decideAgentApproval, startAgentRun } from "@/lib/agent/service.server";
import { validateRunBody } from "@/lib/agent/validate";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Agentic preparation run (Module 13, ADR-035).
 *  - { "action": "start",  "goal": "<text>", "scholarshipId": "<uuid>" }  -> runs the bounded agent loop, returns a structured result
 *  - { "action": "decide", "token": "<approval token>", "decision": "approve" | "decline" } -> executes (or declines) ONE action the server asked approval for
 * Signed-in users only; JSON only; same-origin REQUIRED (this endpoint can write); the user id comes from the session, never from the body.
 * The body can never name a tool, a user, or an approval: tools are chosen and policed server-side. Errors are generic codes.
 */
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: "unavailable" }, 503);

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "unsupported_media_type" }, 415);
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try { originHost = origin ? new URL(origin).host : null; } catch { /* rejected below */ }
  if (!originHost || !host || originHost !== host) return json({ error: "forbidden" }, 403);   // a missing Origin is rejected too

  const current = await getCurrentUser();
  if (!current) return json({ error: "unauthenticated" }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_body" }, 400); }
  const v = validateRunBody(body);
  if (!v.ok) return json({ error: "invalid_body" }, 400);

  try {
    if (v.value.action === "start") {
      const run = await startAgentRun({ userId: current.user.id, goal: v.value.goal, scholarshipId: v.value.scholarshipId });
      if (run.termination === "scholarship_not_found") return json({ error: "not_found" }, 404);
      if (run.termination === "model_unavailable") return json({ error: "unavailable" }, 503);
      return json(run, 200);
    }
    const r = await decideAgentApproval({ userId: current.user.id, token: v.value.token, decision: v.value.decision });
    if (r.status === "declined") return json({ status: "declined" }, 200);
    if (r.status === "rejected") return json({ error: r.code === "wrong_user" ? "forbidden" : "invalid_approval" }, r.code === "wrong_user" ? 403 : 400);
    if (!r.result.ok) return json({ status: "failed", tool: r.tool }, 200);
    return json({ status: "executed", tool: r.tool, data: r.result.data }, 200);
  } catch {
    return json({ error: "agent_failed" }, 500);
  }
}
