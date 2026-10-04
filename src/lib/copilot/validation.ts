import {
  CONTENT_MAX,
  EXTRA_INSTRUCTIONS_MAX,
  isDraftType,
  PROMPT_SUMMARY_MAX,
  QUESTION_MAX,
  TITLE_MAX,
  type DraftType,
} from "./constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function parseDraftType(v: unknown): DraftType | null {
  return isDraftType(v) ? v : null;
}

export function parseTitle(v: unknown): string | null | { error: string } {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return { error: "Invalid title." };
  const t = v.trim();
  if (t.length > TITLE_MAX) return { error: `Title must be at most ${TITLE_MAX} characters.` };
  return t;
}

export function parseContent(v: unknown): string | { error: string } {
  if (typeof v !== "string") return { error: "Content is required." };
  if (v.length > CONTENT_MAX) return { error: `Content must be at most ${CONTENT_MAX} characters.` };
  return v;
}

export function parseQuestion(v: unknown): string | null | { error: string } {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return { error: "Invalid question." };
  const t = v.trim();
  if (t.length > QUESTION_MAX) return { error: `Question must be at most ${QUESTION_MAX} characters.` };
  return t;
}

export function parseExtraInstructions(v: unknown): string | null | { error: string } {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return { error: "Invalid instructions." };
  const t = v.trim();
  if (t.length > EXTRA_INSTRUCTIONS_MAX) {
    return { error: `Instructions must be at most ${EXTRA_INSTRUCTIONS_MAX} characters.` };
  }
  return t;
}

export function parsePromptSummary(v: unknown): string | null | { error: string } {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return { error: "Invalid summary." };
  const t = v.trim();
  if (t.length > PROMPT_SUMMARY_MAX) return { error: `Summary must be at most ${PROMPT_SUMMARY_MAX} characters.` };
  return t;
}
