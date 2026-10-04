import { createHash } from "node:crypto";

import { KNOWLEDGE_CONFIG, type KnowledgeErrorCode } from "./config";
import type { TextBlock } from "./extract";

export type Chunk = {
  index: number;
  content: string;
  section: string | null;
  pageNumber: number | null;   // always null for HTML/plain text (no page concept); reserved for future PDF support
  contentHash: string;
  metadata: { chunking_version: string; char_count: number };
};

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

type Cfg = { targetChars: number; maxChars: number; overlapChars: number; minChars: number; maxChunksPerDocument: number; version: string };

/** Splits an oversized paragraph at whitespace into windows of ≤ maxChars with word-aligned overlap. */
function splitLong(p: string, cfg: Cfg): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < p.length) {
    let end = Math.min(start + cfg.maxChars, p.length);
    if (end < p.length) {
      const ws = p.lastIndexOf(" ", end);
      if (ws > start + cfg.minChars) end = ws;
    }
    out.push(p.slice(start, end).trim());
    if (end >= p.length) break;
    let next = Math.max(end - cfg.overlapChars, start + 1);
    const ws = p.indexOf(" ", next);
    if (ws !== -1 && ws < end) next = ws + 1;
    start = next;
  }
  return out.filter(Boolean);
}

/**
 * Deterministic chunker: same blocks + same config → identical chunks (including hashes).
 * Chunks never cross section boundaries. Paragraphs are packed up to targetChars; oversized paragraphs are
 * window-split with overlap; a trailing fragment shorter than minChars is merged into the previous chunk of the
 * same section when it fits (short facts such as a deadline line are kept, never dropped).
 */
export function chunkBlocks(blocks: readonly TextBlock[], overrides: Partial<Cfg> = {}):
  { ok: true; value: Chunk[] } | { ok: false; code: KnowledgeErrorCode } {
  const cfg: Cfg = { ...KNOWLEDGE_CONFIG.chunking, ...overrides, version: overrides.version ?? KNOWLEDGE_CONFIG.chunking.version };
  const chunks: Chunk[] = [];
  for (const block of blocks) {
    const pieces: string[] = [];
    let cur = "";
    const push = () => { if (cur) { pieces.push(cur); cur = ""; } };
    for (const para of block.text.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)) {
      if (para.length > cfg.maxChars) { push(); pieces.push(...splitLong(para, cfg)); continue; }
      if (cur && cur.length + 2 + para.length > cfg.targetChars) push();
      cur = cur ? `${cur}\n\n${para}` : para;
    }
    push();
    const merged: string[] = [];
    for (const piece of pieces) {
      const prev = merged[merged.length - 1];
      if (prev !== undefined && piece.length < cfg.minChars && prev.length + 2 + piece.length <= cfg.maxChars) merged[merged.length - 1] = `${prev}\n\n${piece}`;
      else merged.push(piece);
    }
    for (const content of merged) {
      chunks.push({
        index: chunks.length, content, section: block.section, pageNumber: null, contentHash: sha256(content),
        metadata: { chunking_version: cfg.version, char_count: content.length },
      });
    }
  }
  if (chunks.length === 0) return { ok: false, code: "empty_content" };
  if (chunks.length > cfg.maxChunksPerDocument) return { ok: false, code: "too_many_chunks" };
  return { ok: true, value: chunks };
}

/**
 * Text sent to the embedding model: document title and section give the chunk context, while the STORED content
 * stays exactly as extracted (so nothing the model sees as "evidence" was added by us).
 */
export function embeddingInput(title: string | null, chunk: Pick<Chunk, "section" | "content">): string {
  return [title, chunk.section, chunk.content].filter((x): x is string => !!x).join("\n");
}
