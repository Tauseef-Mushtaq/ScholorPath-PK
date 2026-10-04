import { KNOWLEDGE_CONFIG } from "./config";
import type { EmbeddingProvider } from "./embeddings";
import { validateEmbedding } from "./embeddings";
import { normalizeText } from "./normalize";

/**
 * Retrieval (ADR-033 §7). SERVER-ONLY consumers (Module 12) must have authorized the caller before calling this.
 * It returns evidence passages with their recorded source. It does not generate answers, does not decide that a
 * passage "proves" a requirement, and does not label sources "official" (source_type is passed through as recorded).
 */
export type RetrievedChunk = {
  chunkId: string; documentId: string; scholarshipId: string | null; content: string; section: string | null;
  pageNumber: number | null; chunkIndex: number;
  /** Raw cosine similarity (1 − cosine distance). NOT a probability or a correctness score. */
  similarity: number;
  source: { id: string; url: string; name: string | null; type: string | null; priority: number; lastVerifiedAt: string | null };
};
export type MatchRow = Record<string, unknown>;
export interface RetrievalStore {
  matchChunks(args: { embedding: number[]; limit: number; scholarshipId: string | null; minSimilarity: number | null }): Promise<MatchRow[] | null>;
}
export type RetrievalInput = { query: unknown; limit?: unknown; scholarshipId?: unknown; minSimilarity?: unknown };
export type RetrievalOutcome =
  | { ok: true; chunks: RetrievedChunk[] }
  | { ok: false; code: "invalid_query" | "embedding_unavailable" | "search_failed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateRetrievalInput(input: RetrievalInput):
  { ok: true; query: string; limit: number; scholarshipId: string | null; minSimilarity: number | null } | { ok: false } {
  const r = KNOWLEDGE_CONFIG.retrieval;
  if (typeof input.query !== "string") return { ok: false };
  const query = normalizeText(input.query).replace(/\s+/g, " ");
  if (query.length < r.minQueryChars || query.length > r.maxQueryChars) return { ok: false };
  let limit: number = r.defaultLimit;
  if (input.limit !== undefined) {
    if (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > r.maxLimit) return { ok: false };
    limit = input.limit;
  }
  let scholarshipId: string | null = null;
  if (input.scholarshipId !== undefined && input.scholarshipId !== null) {
    if (typeof input.scholarshipId !== "string" || !UUID.test(input.scholarshipId)) return { ok: false };
    scholarshipId = input.scholarshipId.toLowerCase();
  }
  let minSimilarity: number | null = null;
  if (input.minSimilarity !== undefined && input.minSimilarity !== null) {
    if (typeof input.minSimilarity !== "number" || !Number.isFinite(input.minSimilarity) || input.minSimilarity < -1 || input.minSimilarity > 1) return { ok: false };
    minSimilarity = input.minSimilarity;
  }
  return { ok: true, query, limit, scholarshipId, minSimilarity };
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const isHttp = (u: string) => /^https?:\/\//i.test(u);

/** Defensive mapping: rows with missing evidence, source or a non-http(s) URL are dropped (fail closed). */
/** Normalize a scholarship id for comparison (DB/PostgREST may return mixed case). Empty → null. */
export function normalizeScholarshipId(id: string | null | undefined): string | null {
  if (typeof id !== "string") return null;
  const t = id.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/** True when the chunk is evidence for exactly this scholarship (defence in depth after SQL filter). */
export function chunkBelongsToScholarship(chunk: { scholarshipId: string | null }, scholarshipId: string): boolean {
  const want = normalizeScholarshipId(scholarshipId);
  const got = normalizeScholarshipId(chunk.scholarshipId);
  return want !== null && got !== null && want === got;
}

export function mapMatchRow(row: MatchRow): RetrievedChunk | null {
  const content = str(row.content), chunkId = str(row.chunk_id), documentId = str(row.knowledge_document_id);
  const sourceId = str(row.source_id), url = str(row.source_url);
  const sim = row.similarity;
  if (!content || !chunkId || !documentId || !sourceId || !url || !isHttp(url) || typeof sim !== "number" || !Number.isFinite(sim)) return null;
  return {
    chunkId, documentId, scholarshipId: normalizeScholarshipId(str(row.scholarship_id)), content, section: str(row.section),
    pageNumber: typeof row.page_number === "number" ? row.page_number : null,
    chunkIndex: typeof row.chunk_index === "number" ? row.chunk_index : 0, similarity: sim,
    source: {
      id: sourceId, url, name: str(row.source_name), type: str(row.source_type),
      priority: typeof row.source_priority === "number" ? row.source_priority : 0, lastVerifiedAt: str(row.source_last_verified_at),
    },
  };
}

export async function retrieveKnowledge(input: RetrievalInput, deps: { embedder: EmbeddingProvider; store: RetrievalStore }): Promise<RetrievalOutcome> {
  const v = validateRetrievalInput(input);
  if (!v.ok) return { ok: false, code: "invalid_query" };
  const emb = await deps.embedder.embed([v.query], "query");
  if (!emb.ok) return { ok: false, code: emb.code === "embedding_unavailable" ? "embedding_unavailable" : "search_failed" };
  const vec = emb.vectors[0];
  if (emb.vectors.length !== 1 || !validateEmbedding(vec, deps.embedder.dimensions)) return { ok: false, code: "search_failed" };
  let rows: MatchRow[] | null;
  try { rows = await deps.store.matchChunks({ embedding: vec, limit: v.limit, scholarshipId: v.scholarshipId, minSimilarity: v.minSimilarity }); }
  catch { return { ok: false, code: "search_failed" }; }
  if (!rows) return { ok: false, code: "search_failed" };
  // Map + fail-closed: drop unsafe rows, then re-apply scholarship scope so a null/mismatched
  // scholarship_id on a document row can never leak into consumers (assistant / agent).
  let chunks = rows.map(mapMatchRow).filter((c): c is RetrievedChunk => c !== null);
  if (v.scholarshipId) chunks = chunks.filter((c) => chunkBelongsToScholarship(c, v.scholarshipId!));
  return { ok: true, chunks: chunks.slice(0, v.limit) };
}
