import { ASSISTANT_CONFIG } from "./config";

export type GenerationOutcome = { ok: true; text: string } | { ok: false; code: "generation_unavailable" | "generation_failed" };
export interface GenerationProvider {
  readonly model: string;
  generate(args: { system: string; user: string }): Promise<GenerationOutcome>;
}

type HttpFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean; status: number; json(): Promise<unknown>;
}>;
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini Developer API `models/{model}:generateContent`. NOT verified against the live API in the authoring sandbox
 * (no key/network). The key is only ever sent in `x-goog-api-key`; it is never logged, returned or placed in errors.
 */
export class GeminiGenerationProvider implements GenerationProvider {
  constructor(readonly model: string, private readonly apiKey: string | undefined, private readonly http: HttpFetch) {}

  async generate(args: { system: string; user: string }): Promise<GenerationOutcome> {
    if (!this.apiKey) return { ok: false, code: "generation_unavailable" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASSISTANT_CONFIG.generation.timeoutMs);
    try {
      const res = await this.http(`${ENDPOINT}/${this.model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.system }] },
          contents: [{ role: "user", parts: [{ text: args.user }] }],
          generationConfig: { temperature: 0, maxOutputTokens: ASSISTANT_CONFIG.generation.maxOutputTokens, responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) return { ok: false, code: "generation_unavailable" };
      if (!res.ok) return { ok: false, code: "generation_failed" };
      const data = (await res.json()) as {
        promptFeedback?: { blockReason?: unknown };
        candidates?: { finishReason?: unknown; content?: { parts?: { text?: unknown }[] } }[];
      } | null;
      if (data?.promptFeedback?.blockReason) return { ok: false, code: "generation_failed" };
      const cand = data?.candidates?.[0];
      // Anything other than a clean stop (e.g. MAX_TOKENS, SAFETY) may be a truncated answer that lost a qualification.
      if (!cand || cand.finishReason !== "STOP") return { ok: false, code: "generation_failed" };
      const text = (cand.content?.parts ?? []).map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
      if (!text.trim()) return { ok: false, code: "generation_failed" };
      return { ok: true, text };
    } catch {
      return { ok: false, code: "generation_failed" };
    } finally {
      clearTimeout(timer);
    }
  }
}
