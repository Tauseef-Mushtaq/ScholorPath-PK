import { ASSISTANT_CONFIG } from "./config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type AskInput = { scholarshipId: string; question: string };

/** Only `scholarshipId` and `question` are read. Any other field (e.g. a URL) is ignored, never used. */
export function validateAskBody(body: unknown): { ok: true; value: AskInput } | { ok: false } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false };
  const b = body as Record<string, unknown>;
  if (typeof b.scholarshipId !== "string" || !UUID.test(b.scholarshipId)) return { ok: false };
  if (typeof b.question !== "string") return { ok: false };
  const question = b.question.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  const q = ASSISTANT_CONFIG.question;
  if (question.length < q.minChars || question.length > q.maxChars) return { ok: false };
  return { ok: true, value: { scholarshipId: b.scholarshipId.toLowerCase(), question } };
}
