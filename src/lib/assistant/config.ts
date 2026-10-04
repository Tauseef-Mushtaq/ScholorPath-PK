/**
 * Module 12 constants (ADR-034). Deliberate limits, not tuned relevance values.
 * The generation model is NOT verified against the live API (see HANDOFF); it can be overridden with
 * GEMINI_GENERATION_MODEL (validated by `resolveGenerationModel`) without a code change.
 */
export const ASSISTANT_CONFIG = {
  question: { minChars: 3, maxChars: 500 },
  /** Chunks sent to the model. Module 11 chunks are <= 1400 chars, so the context stays small and bounded. */
  retrievalLimit: 6,
  generation: {
    defaultModel: "gemini-3.1-flash-lite",
    timeoutMs: 30_000,
    maxOutputTokens: 2048,
    maxAnswerChars: 3000,
  },
  excerptChars: 280,
} as const;

export const INSUFFICIENT_MESSAGE =
  "The sources recorded for this scholarship do not establish an answer to this question. Please check the official website directly.";

/** Accepts only plain model ids (no path/query characters); anything else falls back to the default. */
export function resolveGenerationModel(envValue: string | undefined): string {
  return envValue && /^[a-z0-9][a-z0-9.\-]{2,63}$/.test(envValue) ? envValue : ASSISTANT_CONFIG.generation.defaultModel;
}
