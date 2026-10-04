import "server-only";

import { getAiKeys } from "@/lib/env.server";
import { retrieve } from "@/lib/knowledge/service.server";

import { answerQuestion, type AssistantResult } from "./answer";
import { resolveGenerationModel } from "./config";
import { GeminiGenerationProvider } from "./generation";

/**
 * Server-only wiring for Module 12. Performs NO authorization: the route must authenticate the user and confirm the
 * scholarship is visible to them first. Reuses the Module 11 `retrieve()` (no second vector search).
 */
export function askAssistant(body: unknown): Promise<AssistantResult> {
  const generator = new GeminiGenerationProvider(
    resolveGenerationModel(process.env.GEMINI_GENERATION_MODEL), getAiKeys().gemini, (url, init) => fetch(url, init),
  );
  return answerQuestion(body, { retrieve, generator });
}
