import "server-only";

import { lookup } from "node:dns/promises";

import { getAiKeys } from "@/lib/env.server";

import { KNOWLEDGE_CONFIG } from "./config";
import { GeminiEmbeddingProvider, type EmbeddingProvider } from "./embeddings";
import { fetchSource, type FetchLike } from "./fetch";
import { ingestSource, type IngestOutcome } from "./pipeline";
import { retrieveKnowledge, type RetrievalInput, type RetrievalOutcome } from "./retrieve";
import { createKnowledgeStore } from "./store.server";

/**
 * Server-only entry points for Module 11. They perform NO authorization: callers must authorize first
 * (the admin route for ingestion; Module 12 for retrieval). Not importable from Client Components.
 */
export function createEmbeddingProvider(): EmbeddingProvider {
  return new GeminiEmbeddingProvider(getAiKeys().gemini, (url, init) => fetch(url, init));
}

const resolveAll = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);

function deps() {
  return {
    store: createKnowledgeStore(),
    embedder: createEmbeddingProvider(),
    fetchSource: (url: string) => fetchSource(url, { fetch: ((u, init) => fetch(u, init)) as FetchLike, resolve: resolveAll }),
    now: () => new Date(),
  };
}

export const ingestSourceById = (sourceId: string): Promise<IngestOutcome> => ingestSource(sourceId, deps());

export async function ingestEligibleBatch(limit: number): Promise<{ attempted: number; results: { sourceId: string; outcome: IngestOutcome }[] } | null> {
  const d = deps();
  const n = Math.max(1, Math.min(Math.trunc(limit) || 1, KNOWLEDGE_CONFIG.ingestion.maxBatch));
  const ids = await d.store.listCandidateSourceIds(n);
  if (!ids) return null;
  const results: { sourceId: string; outcome: IngestOutcome }[] = [];
  for (const sourceId of ids) results.push({ sourceId, outcome: await ingestSource(sourceId, d) });   // sequential on purpose
  return { attempted: ids.length, results };
}

export function retrieve(input: RetrievalInput): Promise<RetrievalOutcome> {
  const d = deps();
  return retrieveKnowledge(input, { embedder: d.embedder, store: d.store });
}
