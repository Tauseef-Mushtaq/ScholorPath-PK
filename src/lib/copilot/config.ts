/** Module 15 — Application Copilot generation settings. */

export const COPILOT_CONFIG = {
  generation: {
    timeoutMs: 45_000,
    maxOutputTokens: 4_096,
    temperature: 0.4,
  },
  /** Soft length guidance by draft type (words, approximate). */
  targetWords: {
    sop: 800,
    motivation_letter: 500,
    personal_statement: 600,
    study_plan: 700,
    scholarship_essay: 500,
    research_proposal: 1200,
    cv: 400,
    application_question: 250,
  } as Record<string, number>,
} as const;

export function resolveCopilotModel(envModel: string | undefined): string {
  return envModel?.trim() || "gemini-2.0-flash";
}
