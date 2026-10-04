import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { KnowledgeErrorCode } from "./config";
import type { SourceRecord } from "./eligibility";
import type { DocumentState, KnowledgeStore } from "./pipeline";
import type { MatchRow, RetrievalStore } from "./retrieve";

/**
 * Service-role persistence for the knowledge base (ADR-033 §6).
 * WHY the service role: ingestion is a system job, not a user action; knowledge_* tables intentionally have no
 * client write path. Callers (the admin route) MUST authorize first. Only error CODES are logged, never content,
 * URLs, keys or database error messages.
 */
const vec = (v: readonly number[]) => `[${v.join(",")}]`;
const logCode = (where: string, e: { code?: string } | null) => console.error(`[knowledge] ${where} failed`, e?.code ?? "unknown");

type SourceRow = {
  id: string; scholarship_id: string; source_url: string; source_name: string | null; source_type: string | null;
  priority: number | null; last_verified_at: string | null; active: boolean;
  scholarships: { status: string | null } | { status: string | null }[] | null;
};
const SOURCE_COLS = "id,scholarship_id,source_url,source_name,source_type,priority,last_verified_at,active,scholarships(status)";

function toSource(r: SourceRow): SourceRecord {
  const sch = Array.isArray(r.scholarships) ? r.scholarships[0] : r.scholarships;
  return {
    id: r.id, scholarshipId: r.scholarship_id, scholarshipStatus: sch?.status ?? null, sourceUrl: r.source_url,
    sourceName: r.source_name, sourceType: r.source_type, priority: r.priority ?? 0, lastVerifiedAt: r.last_verified_at, active: r.active,
  };
}

export function createKnowledgeStore(): KnowledgeStore & RetrievalStore & { listCandidateSourceIds(limit: number): Promise<string[] | null> } {
  const db = createAdminClient();
  return {
    async getSource(sourceId) {
      const { data, error } = await db.from("scholarship_sources").select(SOURCE_COLS).eq("id", sourceId).maybeSingle();
      if (error) { logCode("getSource", error); return null; }
      return data ? toSource(data as unknown as SourceRow) : null;
    },

    async getDocumentState(sourceId): Promise<DocumentState | null> {
      const { data, error } = await db.from("knowledge_documents")
        .select("id,processing_status,content_hash,version,chunking_version,embedding_model,embedding_dimensions,last_attempt_at")
        .eq("source_id", sourceId).maybeSingle();
      if (error || !data) { if (error) logCode("getDocumentState", error); return null; }
      return {
        id: data.id, processingStatus: data.processing_status, contentHash: data.content_hash, version: data.version,
        chunkingVersion: data.chunking_version, embeddingModel: data.embedding_model,
        embeddingDimensions: data.embedding_dimensions, lastAttemptAt: data.last_attempt_at,
      };
    },

    async beginAttempt(source, now) {
      const { data, error } = await db.from("knowledge_documents").upsert({
        source_id: source.id, scholarship_id: source.scholarshipId, topic_type: "scholarship",
        source_url: source.sourceUrl, source_type: source.sourceType, source_priority: source.priority,
        last_verified_at: source.lastVerifiedAt, processing_status: "processing", error_code: null,
        last_attempt_at: now.toISOString(), active: true,
      }, { onConflict: "source_id" }).select("id").single();
      if (error || !data) { logCode("beginAttempt", error); return null; }
      return { documentId: data.id };
    },

    async markFailed(documentId, code: KnowledgeErrorCode, now) {
      const { error } = await db.from("knowledge_documents")
        .update({ processing_status: "failed", error_code: code, last_attempt_at: now.toISOString() }).eq("id", documentId);
      if (error) logCode("markFailed", error);
    },

    async markUnchanged(documentId, now) {
      const { error } = await db.from("knowledge_documents")
        .update({ processing_status: "ready", error_code: null, last_attempt_at: now.toISOString() }).eq("id", documentId);
      if (error) logCode("markUnchanged", error);
    },

    async replaceChunks(i) {
      // Not one transaction (supabase-js has none). Safe because retrieval only sees documents whose status is
      // 'ready', and the status flips to 'ready' only after every chunk is stored.
      const del = await db.from("knowledge_chunks").delete().eq("knowledge_document_id", i.documentId);
      if (del.error) { logCode("deleteChunks", del.error); return false; }
      for (let at = 0; at < i.chunks.length; at += 50) {
        const rows = i.chunks.slice(at, at + 50).map((c) => ({
          knowledge_document_id: i.documentId, chunk_index: c.index, content: c.content, embedding: vec(c.embedding),
          page_number: c.pageNumber, section: c.section, metadata: c.metadata, content_hash: c.contentHash,
        }));
        const ins = await db.from("knowledge_chunks").insert(rows);
        if (ins.error) { logCode("insertChunks", ins.error); return false; }
      }
      const upd = await db.from("knowledge_documents").update({
        title: i.title, content_hash: i.contentHash, version: i.version, processing_status: "ready", error_code: null,
        chunk_count: i.chunks.length, embedding_model: i.embeddingModel, embedding_dimensions: i.embeddingDimensions,
        chunking_version: i.chunkingVersion, ingested_at: i.now.toISOString(), last_attempt_at: i.now.toISOString(),
      }).eq("id", i.documentId);
      if (upd.error) { logCode("finalize", upd.error); return false; }
      return true;
    },

    async matchChunks(a): Promise<MatchRow[] | null> {
      const { data, error } = await db.rpc("match_knowledge_chunks", {
        query_embedding: vec(a.embedding), match_count: a.limit, min_similarity: a.minSimilarity, filter_scholarship_id: a.scholarshipId,
      });
      if (error) { logCode("matchChunks", error); return null; }
      return (data ?? []) as MatchRow[];
    },

    /** Active, verified sources of active scholarships that do not yet have a READY document (deterministic order). */
    async listCandidateSourceIds(limit) {
      const { data, error } = await db.from("scholarship_sources")
        .select("id,scholarships!inner(status)").eq("active", true).not("last_verified_at", "is", null)
        .eq("scholarships.status", "active").order("id").limit(200);
      if (error || !data) { if (error) logCode("listCandidates", error); return null; }
      const ids = (data as { id: string }[]).map((r) => r.id);
      if (ids.length === 0) return [];
      const docs = await db.from("knowledge_documents").select("source_id").in("source_id", ids).eq("processing_status", "ready");
      if (docs.error) { logCode("listCandidates.docs", docs.error); return null; }
      const ready = new Set((docs.data ?? []).map((d: { source_id: string }) => d.source_id));
      return ids.filter((id) => !ready.has(id)).slice(0, limit);
    },
  };
}
