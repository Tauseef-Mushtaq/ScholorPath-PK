import { chunkBelongsToScholarship, type RetrievalInput, type RetrievalOutcome, type RetrievedChunk } from "../knowledge/retrieve";

import { ASSISTANT_CONFIG, INSUFFICIENT_MESSAGE } from "./config";
import type { GenerationProvider } from "./generation";
import { buildUserContent, SYSTEM_INSTRUCTION } from "./prompt";
import { validateAskBody } from "./validate";

export type SourceRef = {
  /** The number the answer cites, e.g. [1]. */
  n: number; chunkId: string; name: string | null; url: string;
  /** Source type exactly as recorded (never upgraded to "official"). */
  type: string | null; section: string | null; chunkIndex: number; lastVerifiedAt: string | null; excerpt: string;
};
export type AssistantResult =
  | { ok: true; status: "answered"; answer: string; sources: SourceRef[] }
  | { ok: true; status: "insufficient"; message: string; sources: [] }
  | { ok: false; code: "invalid_request" | "unavailable" | "failed" };

export type AssistantDeps = { retrieve: (input: RetrievalInput) => Promise<RetrievalOutcome>; generator: GenerationProvider };

type Parsed = { status: "answered"; answer: string; citations: number[] } | { status: "insufficient" } | null;

/** Strict parse of the model's JSON. Anything malformed is rejected (fail closed). */
export function parseModelOutput(text: string, sourceCount: number): Parsed {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) t = fence[1];
  let obj: unknown;
  try { obj = JSON.parse(t); } catch { return null; }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if (o.status === "insufficient") return { status: "insufficient" };
  if (o.status !== "answered" || typeof o.answer !== "string" || !Array.isArray(o.citations)) return null;
  const answer = o.answer.trim();
  if (!answer || answer.length > ASSISTANT_CONFIG.generation.maxAnswerChars) return null;
  const citations: number[] = [];
  for (const c of o.citations) {
    if (typeof c !== "number" || !Number.isInteger(c) || c < 1 || c > sourceCount) return null;   // invented source number
    if (!citations.includes(c)) citations.push(c);
  }
  // "Answered" without a valid citation is unsupported by definition.
  if (citations.length === 0) return null;
  return { status: "answered", answer, citations };
}

const insufficient = (): AssistantResult => ({ ok: true, status: "insufficient", message: INSUFFICIENT_MESSAGE, sources: [] });

/**
 * Module 12 core: validate -> retrieve (Module 11, scoped to the scholarship) -> grounded generation -> cited sources.
 * The CALLER must already have authenticated the user and confirmed the scholarship is visible to them.
 */
export async function answerQuestion(body: unknown, deps: AssistantDeps): Promise<AssistantResult> {
  const v = validateAskBody(body);
  if (!v.ok) return { ok: false, code: "invalid_request" };   // generator is never reached
  const { scholarshipId, question } = v.value;

  let r: RetrievalOutcome;
  try { r = await deps.retrieve({ query: question, scholarshipId, limit: ASSISTANT_CONFIG.retrievalLimit }); } catch { return { ok: false, code: "failed" }; }
  if (!r.ok) return { ok: false, code: r.code === "invalid_query" ? "invalid_request" : r.code === "embedding_unavailable" ? "unavailable" : "failed" };

  // Defence in depth: only chunks that belong to THIS scholarship may reach the model.
  const chunks: RetrievedChunk[] = r.chunks.filter((c) => chunkBelongsToScholarship(c, scholarshipId)).slice(0, ASSISTANT_CONFIG.retrievalLimit);
  if (chunks.length === 0) return insufficient();   // no evidence -> no model call, no general-knowledge answer

  let g: Awaited<ReturnType<GenerationProvider["generate"]>>;
  try { g = await deps.generator.generate({ system: SYSTEM_INSTRUCTION, user: buildUserContent(question, chunks) }); } catch { return { ok: false, code: "failed" }; }
  if (!g.ok) return { ok: false, code: g.code === "generation_unavailable" ? "unavailable" : "failed" };

  const parsed = parseModelOutput(g.text, chunks.length);
  if (!parsed) return { ok: false, code: "failed" };
  if (parsed.status === "insufficient") return insufficient();

  const sources: SourceRef[] = parsed.citations.sort((a, b) => a - b).map((n) => {
    const c = chunks[n - 1];
    return {
      n, chunkId: c.chunkId, name: c.source.name, url: c.source.url, type: c.source.type, section: c.section,
      chunkIndex: c.chunkIndex, lastVerifiedAt: c.source.lastVerifiedAt, excerpt: c.content.slice(0, ASSISTANT_CONFIG.excerptChars),
    };
  });
  return { ok: true, status: "answered", answer: parsed.answer, sources };
}
