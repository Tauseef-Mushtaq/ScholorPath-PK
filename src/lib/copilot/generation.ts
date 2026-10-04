import { COPILOT_CONFIG } from "./config";

export type GenerationOutcome = { ok: true; text: string } | { ok: false; code: "generation_unavailable" | "generation_failed" };

export interface GenerationProvider {
  readonly model: string;
  generate(args: { system: string; user: string }): Promise<GenerationOutcome>;
}

type HttpFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini generateContent for draft text (plain text, not JSON).
 * Key only in x-goog-api-key; never logged or returned.
 */
export class GeminiCopilotProvider implements GenerationProvider {
  constructor(
    readonly model: string,
    private readonly apiKey: string | undefined,
    private readonly http: HttpFetch,
  ) {}

  async generate(args: { system: string; user: string }): Promise<GenerationOutcome> {
    if (!this.apiKey) return { ok: false, code: "generation_unavailable" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COPILOT_CONFIG.generation.timeoutMs);
    try {
      const res = await this.http(`${ENDPOINT}/${this.model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.system }] },
          contents: [{ role: "user", parts: [{ text: args.user }] }],
          generationConfig: {
            temperature: COPILOT_CONFIG.generation.temperature,
            maxOutputTokens: COPILOT_CONFIG.generation.maxOutputTokens,
          },
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
      if (!cand) return { ok: false, code: "generation_failed" };
      const text = (cand.content?.parts ?? []).map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
      if (!text.trim()) return { ok: false, code: "generation_failed" };
      return { ok: true, text: text.trim() };
    } catch {
      return { ok: false, code: "generation_failed" };
    } finally {
      clearTimeout(timer);
    }
  }
}
