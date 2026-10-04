import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { GeminiGenerationProvider } from "../assistant/generation";
import { resolveGenerationModel } from "../assistant/config";
import { getAiKeys, getSupabaseServiceRoleKey } from "../env.server";
import { retrieve } from "../knowledge/service.server";
import { getFilterOptions, getScholarships } from "../public/queries";
import { createClient } from "../supabase/server";
import type { ApprovalSigner } from "./approval";
import { createExecutors } from "./executors.server";
import { resumeApproval, runAgent, toPublicRun, type AgentDeps, type PublicRun, type ResumeResult, type RunInput } from "./orchestrator";

/**
 * Server-only wiring for Module 13. Performs NO authentication: the route must authenticate first and pass the
 * session user id. Uses the Module 12 Gemini provider (no second client) and the Module 11 retrieval service.
 * The approval-signing key is DERIVED (domain-separated HMAC) from a server secret and never leaves the server.
 */
function createSigner(): ApprovalSigner {
  const key = createHmac("sha256", getSupabaseServiceRoleKey()).update("scholarpath-agent-approval-v1").digest();
  const sign = (data: string) => createHmac("sha256", key).update(data).digest("base64url");
  return {
    sign,
    verify(data, signature) {
      const a = Buffer.from(sign(data)); const b = Buffer.from(signature);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}

async function buildDeps(): Promise<AgentDeps> {
  const supabase = await createClient();   // the USER's cookie-bound client: RLS applies to every tool
  return {
    executors: createExecutors({ supabase, retrieve, catalog: { loadVocabulary: getFilterOptions, searchCatalog: getScholarships } }),
    generator: new GeminiGenerationProvider(resolveGenerationModel(process.env.GEMINI_GENERATION_MODEL), getAiKeys().gemini, (url, init) => fetch(url, init)),
    signer: createSigner(),
    nowMs: () => Date.now(),
    todayIso: new Date().toISOString().slice(0, 10),
    nonce: () => randomUUID(),
  };
}

export async function startAgentRun(input: RunInput): Promise<PublicRun> {
  return toPublicRun(await runAgent(input, await buildDeps()));
}
export async function decideAgentApproval(args: { userId: string; token: string; decision: "approve" | "decline" }): Promise<ResumeResult> {
  return resumeApproval(args, await buildDeps());
}
