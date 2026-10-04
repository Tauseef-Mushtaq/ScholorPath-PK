/**
 * Module 11 constants (ADR-033). Every limit here is a documented, deliberate choice, not a tuned
 * "relevance" value. Changing the embedding model/dimensions requires a new migration (the column is vector(768)).
 */
export const KNOWLEDGE_CONFIG = {
  fetch: {
    timeoutMs: 15_000,
    maxRedirects: 3,
    maxResponseBytes: 2_000_000,
    maxUrlLength: 2048,
    allowedPorts: [80, 443] as readonly number[],
    // PDF is intentionally NOT supported yet (no PDF parser dependency; see ADR-033 §5).
    allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"] as readonly string[],
    userAgent: "ScholarPathBot/1.0 (scholarship source ingestion)",
  },
  extract: { maxExtractedChars: 400_000 },
  chunking: {
    version: "v1-paragraph-1000-1400-150",
    targetChars: 1000,
    maxChars: 1400,
    overlapChars: 150,
    minChars: 80,
    maxChunksPerDocument: 300,
  },
  embedding: {
    provider: "gemini",
    model: "gemini-embedding-001",
    dimensions: 768,
    timeoutMs: 20_000,
    concurrency: 4,
  },
  retrieval: { defaultLimit: 8, maxLimit: 20, minQueryChars: 3, maxQueryChars: 500 },
  ingestion: { maxBatch: 10, staleProcessingMs: 15 * 60 * 1000 },
} as const;

/** Safe, short, machine-readable failure codes. These are the ONLY error text persisted. */
export type KnowledgeErrorCode =
  | "invalid_url" | "blocked_url" | "dns_failed" | "too_many_redirects" | "fetch_timeout" | "fetch_failed"
  | "http_error" | "unsupported_content_type" | "response_too_large" | "empty_content" | "content_too_large"
  | "too_many_chunks" | "embedding_unavailable" | "embedding_failed" | "embedding_invalid" | "persist_failed";

export type Result<T, E extends string = KnowledgeErrorCode> = { ok: true; value: T } | { ok: false; code: E };
