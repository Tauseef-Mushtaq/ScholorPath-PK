import { KNOWLEDGE_CONFIG, type KnowledgeErrorCode } from "./config";

/**
 * Provider interface (ADR-003/ADR-033): the rest of the module depends on this, never on Gemini directly.
 * There is intentionally NO fake/hash-based implementation here: a fake would look like semantic search but is not.
 */
export type EmbeddingTask = "document" | "query";
export type EmbedOutcome = { ok: true; vectors: number[][] } | { ok: false; code: Extract<KnowledgeErrorCode, "embedding_unavailable" | "embedding_failed" | "embedding_invalid"> };

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: readonly string[], task: EmbeddingTask): Promise<EmbedOutcome>;
}

/** A vector is storable only if it has exactly `dims` finite numbers and is not all zeros. */
export function validateEmbedding(v: unknown, dims: number): v is number[] {
  if (!Array.isArray(v) || v.length !== dims) return false;
  let nonZero = false;
  for (const x of v) {
    if (typeof x !== "number" || !Number.isFinite(x)) return false;
    if (x !== 0) nonZero = true;
  }
  return nonZero;
}

/** gemini-embedding-001 only pre-normalizes its 3072-dim output, so reduced-size vectors are normalized here. */
export function l2Normalize(v: readonly number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? [...v] : v.map((x) => x / norm);
}

type HttpFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean; status: number; json(): Promise<unknown>;
}>;

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini Developer API `models/gemini-embedding-001:embedContent` (checked against Google's docs, Oct 2026).
 * NOT verified against the live API in this repo (no key/network in the authoring sandbox).
 * The API key is only ever placed in the `x-goog-api-key` header; it is never logged, returned or put in errors.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly model = KNOWLEDGE_CONFIG.embedding.model;
  readonly dimensions = KNOWLEDGE_CONFIG.embedding.dimensions;
  constructor(private readonly apiKey: string | undefined, private readonly http: HttpFetch) {}

  private async one(text: string, task: EmbeddingTask): Promise<number[] | "unavailable" | "failed" | "invalid"> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KNOWLEDGE_CONFIG.embedding.timeoutMs);
    try {
      const res = await this.http(`${ENDPOINT}/${this.model}:embedContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey as string },
        body: JSON.stringify({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          taskType: task === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
          outputDimensionality: this.dimensions,
        }),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) return "unavailable";
      if (!res.ok) return "failed";
      const data = (await res.json()) as { embedding?: { values?: unknown } } | null;
      const values = data?.embedding?.values;
      if (!validateEmbedding(values, this.dimensions)) return "invalid";
      return l2Normalize(values);
    } catch {
      return "failed";
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(texts: readonly string[], task: EmbeddingTask): Promise<EmbedOutcome> {
    if (!this.apiKey) return { ok: false, code: "embedding_unavailable" };
    if (texts.length === 0 || texts.some((t) => typeof t !== "string" || t.trim() === "")) return { ok: false, code: "embedding_invalid" };
    const out: number[][] = new Array(texts.length);
    let next = 0;
    let failure: "unavailable" | "failed" | "invalid" | null = null;
    const worker = async () => {
      while (failure === null) {
        const i = next++;
        if (i >= texts.length) return;
        const r = await this.one(texts[i], task);
        if (typeof r === "string") { failure = r; return; }
        out[i] = r;
      }
    };
    await Promise.all(Array.from({ length: Math.min(KNOWLEDGE_CONFIG.embedding.concurrency, texts.length) }, worker));
    if (failure) return { ok: false, code: failure === "unavailable" ? "embedding_unavailable" : failure === "invalid" ? "embedding_invalid" : "embedding_failed" };
    return { ok: true, vectors: out };
  }
}
