import type { GoalKind, PlanStep, PlanStepId } from "./types";

export const STEP_LABELS: Record<PlanStepId, string> = {
  identify_scholarship: "Scholarship identified",
  retrieve_requirements: "Requirements checked",
  inspect_profile: "Profile reviewed",
  inspect_documents: "Documents reviewed",
  check_eligibility: "Eligibility checked",
  search_verified_knowledge: "Verified sources searched",
  identify_gaps: "Missing items identified",
  create_tasks: "Preparation tasks created",
  build_roadmap: "Preparation plan built",
  summarize: "Readiness summarised",
  interpret_request: "Request understood",
  search_catalog: "Scholarship database searched",
};

/** Canonical order. Steps are always executed in this order; the model may only OMIT optional ones. */
export const CANONICAL_ORDER: readonly PlanStepId[] = [
  "identify_scholarship", "retrieve_requirements", "inspect_profile", "inspect_documents", "check_eligibility",
  "search_verified_knowledge", "identify_gaps", "create_tasks", "build_roadmap", "summarize",
];
/** Steps that carry authorization/grounding duties; they can never be omitted. */
export const REQUIRED_STEPS: readonly PlanStepId[] = ["identify_scholarship", "retrieve_requirements", "inspect_profile", "check_eligibility", "identify_gaps", "summarize"];
export const OPTIONAL_STEPS: readonly PlanStepId[] = CANONICAL_ORDER.filter((s) => !REQUIRED_STEPS.includes(s));

/** Discovery = the student asks to FIND scholarships. A request that also asks for preparation is a preparation request. */
const DISCOVER_VERB = /\b(find|search(?:ing)?|look(?:ing)?\s+for|discover|show|list|recommend|suggest|get\s+me\s+(?!ready\b)|give\s+me|are\s+there|is\s+there)\b/i;
const DISCOVER_QUESTION = /\b(what|which)\s+(?:\w+\s+){0,5}?(scholarships?|fellowships?|bursar(?:y|ies)|grants?|stipends?)\b/i;
const SCHOLARSHIP_NOUN = /\b(scholarships?|fellowships?|bursar(?:y|ies)|grants?|stipends?|funded|funding)\b/i;
const STRONG_PREPARE = /\b(prepar\w*|readiness|get\s+(?:me\s+)?ready|roadmap|checklist|application plan|what do i need|what should i do)\b/i;
const PREPARE = /\b(prepar\w*|ready|readiness|get\s+(?:me\s+)?ready|roadmap|plan|checklist|what do i need|what should i do|apply|application plan|help me with|work on)\b/i;
const FORBIDDEN_VERB = /\b(submit|send|email|e-mail|message|pay|payment|sign|accept|agree)\b/i;
const QUESTION = /\?\s*$|^(is|are|does|do|what|when|where|which|who|how|can|will)\b/i;

/** Deterministic goal classification. No model involved, so an unsupported goal never costs a model call. */
export function classifyGoal(goal: string): GoalKind {
  const g = goal.trim();
  if (!g) return "ambiguous";
  if (!STRONG_PREPARE.test(g) && !FORBIDDEN_VERB.test(g) && ((DISCOVER_VERB.test(g) && SCHOLARSHIP_NOUN.test(g)) || DISCOVER_QUESTION.test(g))) return "discover_scholarships";
  if (PREPARE.test(g)) return "prepare_scholarship";
  if (FORBIDDEN_VERB.test(g)) return "unsupported";
  if (QUESTION.test(g)) return "unsupported";   // single questions belong to the Module 12 Q&A assistant
  return "ambiguous";
}

/** Discovery plan: read-only, two steps. */
export const DISCOVERY_ORDER: readonly PlanStepId[] = ["interpret_request", "search_catalog"];
export function buildDiscoveryPlan(): PlanStep[] { return DISCOVERY_ORDER.map((id) => ({ id, label: STEP_LABELS[id], status: "pending" as const })); }

export function buildPlan(include: readonly PlanStepId[] = CANONICAL_ORDER): PlanStep[] {
  const set = new Set<PlanStepId>([...REQUIRED_STEPS, ...include]);
  return CANONICAL_ORDER.filter((s) => set.has(s)).map((id) => ({ id, label: STEP_LABELS[id], status: "pending" as const }));
}

/** Applies a (validated) model-proposed subset: required steps are always kept; unknown ids are ignored by the caller. */
export function applyModelPlan(proposed: readonly PlanStepId[]): PlanStep[] { return buildPlan(proposed); }

const STOP = new Set(["prepare", "me", "for", "this", "that", "scholarship", "scholarships", "the", "a", "an", "my", "to", "get", "ready", "please", "help", "with", "apply", "application", "plan", "roadmap", "checklist", "i", "want", "need", "and", "on", "work"]);
/** Search text derived from the goal ONLY when the request carried no scholarshipId. Returns null when nothing specific remains. */
export function scholarshipQueryFromGoal(goal: string): string | null {
  const words = goal.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  const q = words.join(" ").trim();
  return q.length >= 2 ? q.slice(0, 100) : null;
}
