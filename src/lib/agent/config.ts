/**
 * Module 13 constants (ADR-035). Hard limits of the bounded agent loop. These are deliberate ceilings, not tuned values.
 * Every limit is enforced by the orchestrator (never by the model).
 */
export const AGENT_CONFIG = {
  goal: { minChars: 3, maxChars: 500 },
  limits: {
    maxIterations: 24,
    maxToolCalls: 20,
    maxModelCalls: 6,
    /** Consecutive/total proposals the server rejected (unknown tool, bad input, not allowed now). */
    maxRejectedProposals: 3,
    maxExecutionMs: 60_000,
    /** Total characters of tool output + retrieved text kept in state / sent to the model. */
    maxEvidenceChars: 24_000,
  },
  rag: { defaultLimit: 4, maxLimit: 6, excerptChars: 280 },
  search: { defaultLimit: 5, maxLimit: 10 },
  task: { titleMax: 140, descriptionMax: 600, maxCreatedPerRun: 8 },
  roadmap: { titleMax: 140, summaryMax: 600, maxSteps: 12, stepTitleMax: 140, stepDescriptionMax: 400 },
  approval: { ttlMs: 15 * 60_000 },
  modelStateDigestChars: 6_000,
  /** Student profile as seen by the agent (Repair Session 5). Caps keep a hostile or huge profile from flooding state / the model. */
  profile: { maxEducation: 10, maxExperiences: 20, shortTextMax: 200, descriptionMax: 600, digestChars: 2_400 },
} as const;
