import { AGENT_CONFIG } from "./config";
import { cleanText, isRecord, uuidField } from "./validators";

export type RunRequest = { action: "start"; goal: string; scholarshipId: string | null } | { action: "decide"; token: string; decision: "approve" | "decline" };

/** Strict body validation. Unknown fields (including anything resembling `userId`, `tool`, `approved`) are ignored, never used. */
export function validateRunBody(body: unknown): { ok: true; value: RunRequest } | { ok: false } {
  if (!isRecord(body)) return { ok: false };
  if (body.action === "start") {
    if (typeof body.goal !== "string") return { ok: false };
    const goal = cleanText(body.goal).replace(/\s+/g, " ");
    if (goal.length < AGENT_CONFIG.goal.minChars || goal.length > AGENT_CONFIG.goal.maxChars) return { ok: false };
    if (body.scholarshipId === undefined || body.scholarshipId === null) return { ok: true, value: { action: "start", goal, scholarshipId: null } };
    const id = uuidField(body.scholarshipId);
    return id ? { ok: true, value: { action: "start", goal, scholarshipId: id } } : { ok: false };
  }
  if (body.action === "decide") {
    if (typeof body.token !== "string" || body.token.length === 0 || body.token.length > 12_000) return { ok: false };
    if (body.decision !== "approve" && body.decision !== "decline") return { ok: false };
    return { ok: true, value: { action: "decide", token: body.token, decision: body.decision } };
  }
  return { ok: false };
}
