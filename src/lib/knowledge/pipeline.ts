import { KNOWLEDGE_CONFIG, type KnowledgeErrorCode } from "./config";
import { chunkBlocks, embeddingInput, sha256, type Chunk } from "./chunk";
import { evaluateSourceEligibility, type IneligibleReason, type SourceRecord } from "./eligibility";
import type { EmbeddingProvider } from "./embeddings";
import { validateEmbedding } from "./embeddings";
import { extractText } from "./extract";
import type { FetchOutcome } from "./fetch";

/** Persistence port (implemented with the service-role client in store.server.ts; mocked in tests). */
export type DocumentState = {
  id: string; processingStatus: string; contentHash: string | null; version: number;
  chunkingVersion: string | null; embeddingModel: string | null; embeddingDimensions: number | null; lastAttemptAt: string | null;
};
export type StoredChunk = Chunk & { embedding: number[] };
export interface KnowledgeStore {
  getSource(sourceId: string): Promise<SourceRecord | null>;
  getDocumentState(sourceId: string): Promise<DocumentState | null>;
  beginAttempt(source: SourceRecord, now: Date): Promise<{ documentId: string } | null>;
  markFailed(documentId: string, code: KnowledgeErrorCode, now: Date): Promise<void>;
  markUnchanged(documentId: string, now: Date): Promise<void>;
  replaceChunks(input: {
    documentId: string; title: string | null; contentHash: string; version: number; chunks: StoredChunk[];
    embeddingModel: string; embeddingDimensions: number; chunkingVersion: string; now: Date;
  }): Promise<boolean>;
}

export type IngestDeps = {
  store: KnowledgeStore;
  embedder: EmbeddingProvider;
  fetchSource: (url: string) => Promise<FetchOutcome>;
  now: () => Date;
};

export type IngestOutcome =
  | { status: "ready"; chunkCount: number }
  | { status: "unchanged" }
  | { status: "skipped"; reason: IneligibleReason | "source_not_found" | "already_processing" }
  | { status: "failed"; code: KnowledgeErrorCode };

/**
 * Stages (each isolated and individually tested): eligibility → fetch → extract → normalize (inside extract) →
 * chunk → embed → persist → status. Only a short error CODE is ever stored; content, URLs and keys never are.
 */
export async function ingestSource(sourceId: string, deps: IngestDeps): Promise<IngestOutcome> {
  const now = deps.now();
  const source = await deps.store.getSource(sourceId);
  if (!source) return { status: "skipped", reason: "source_not_found" };
  const elig = evaluateSourceEligibility(source, now);
  if (!elig.eligible) return { status: "skipped", reason: elig.reason };

  const existing = await deps.store.getDocumentState(sourceId);
  if (existing?.processingStatus === "processing" && existing.lastAttemptAt
      && now.getTime() - Date.parse(existing.lastAttemptAt) < KNOWLEDGE_CONFIG.ingestion.staleProcessingMs) {
    return { status: "skipped", reason: "already_processing" };
  }
  const attempt = await deps.store.beginAttempt(source, now);
  if (!attempt) return { status: "failed", code: "persist_failed" };
  const fail = async (code: KnowledgeErrorCode): Promise<IngestOutcome> => {
    await deps.store.markFailed(attempt.documentId, code, deps.now());
    return { status: "failed", code };
  };

  const fetched = await deps.fetchSource(source.sourceUrl);
  if (!fetched.ok) return fail(fetched.code);
  const extracted = extractText(fetched.value.contentType, fetched.value.text);
  if (!extracted.ok) return fail(extracted.code);

  const { title, blocks } = extracted.value;
  const contentHash = sha256(JSON.stringify([title, blocks]));
  const cfg = KNOWLEDGE_CONFIG.chunking;
  const model = deps.embedder.model, dims = deps.embedder.dimensions;
  if (existing && existing.processingStatus === "ready" && existing.contentHash === contentHash
      && existing.chunkingVersion === cfg.version && existing.embeddingModel === model && existing.embeddingDimensions === dims) {
    await deps.store.markUnchanged(attempt.documentId, deps.now());
    return { status: "unchanged" };
  }

  const chunked = chunkBlocks(blocks);
  if (!chunked.ok) return fail(chunked.code);
  const emb = await deps.embedder.embed(chunked.value.map((c) => embeddingInput(title, c)), "document");
  if (!emb.ok) return fail(emb.code);
  if (emb.vectors.length !== chunked.value.length || !emb.vectors.every((v) => validateEmbedding(v, dims))) return fail("embedding_invalid");

  const stored: StoredChunk[] = chunked.value.map((c, i) => ({ ...c, embedding: emb.vectors[i] }));
  const saved = await deps.store.replaceChunks({
    documentId: attempt.documentId, title, contentHash, version: (existing?.version ?? 0) + 1, chunks: stored,
    embeddingModel: model, embeddingDimensions: dims, chunkingVersion: cfg.version, now: deps.now(),
  });
  if (!saved) return fail("persist_failed");
  return { status: "ready", chunkCount: stored.length };
}
