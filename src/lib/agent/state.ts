import { AGENT_CONFIG } from "./config";
import { buildDiscoveryPlan, buildPlan, classifyGoal } from "./plan";
import type {
  AgentError, AgentProfile, AgentState, ApprovalRequest, DiscoveryResult, DocumentMeta, EligibilityData, EvidenceItem, FinalReport, MissingInfo, PlanStepId,
  RoadmapData, ScholarshipData, StepStatus, TaskData, TerminationReason, ToolCallRecord,
} from "./types";

export function createInitialState(args: { userId: string; goal: string; scholarshipId: string | null }): AgentState {
  const goalKind = classifyGoal(args.goal);
  const plan = goalKind === "discover_scholarships" ? buildDiscoveryPlan() : buildPlan();
  return {
    userId: args.userId, goal: args.goal, goalKind, autonomy: "L2", scholarshipId: args.scholarshipId, discovery: null,
    plan, currentStep: null, completedSteps: [], pendingSteps: plan.map((p) => p.id),
    toolCalls: [], scholarship: null, profile: null, documents: null, retrievedEvidence: [], requirements: [], eligibility: null, missing: [],
    createdTasks: [], roadmapChanges: [], roadmap: null, approvalRequests: [], conflicts: [], errors: [],
    counters: { iterations: 0, toolCalls: 0, modelCalls: 0, rejectedProposals: 0, evidenceChars: 0 },
    finalResponse: null, termination: null,
  };
}

/** State transitions are pure: each returns a NEW state (the previous object is never mutated). */
const withPlan = (s: AgentState, id: PlanStepId, status: StepStatus): AgentState => {
  const plan = s.plan.map((p) => (p.id === id ? { ...p, status } : p));
  const done = (p: { status: StepStatus }) => p.status === "completed" || p.status === "failed" || p.status === "skipped";
  return {
    ...s, plan,
    completedSteps: plan.filter((p) => p.status === "completed").map((p) => p.id),
    pendingSteps: plan.filter((p) => !done(p)).map((p) => p.id),
    currentStep: status === "in_progress" ? id : s.currentStep === id ? null : s.currentStep,
  };
};
export const beginStep = (s: AgentState, id: PlanStepId) => withPlan(s, id, "in_progress");
export const completeStep = (s: AgentState, id: PlanStepId) => withPlan(s, id, "completed");
export const failStep = (s: AgentState, id: PlanStepId, error: AgentError) => ({ ...withPlan(s, id, "failed"), errors: [...s.errors, error] });
export const pauseStep = (s: AgentState, id: PlanStepId) => withPlan(s, id, "pending");
export const skipStep = (s: AgentState, id: PlanStepId) => withPlan(s, id, "skipped");

export const nextPendingStep = (s: AgentState): PlanStepId | null => s.pendingSteps[0] ?? null;
export const bump = (s: AgentState, key: keyof AgentState["counters"], by = 1): AgentState => ({ ...s, counters: { ...s.counters, [key]: s.counters[key] + by } });
export const recordToolCall = (s: AgentState, r: Omit<ToolCallRecord, "index">): AgentState => ({ ...s, toolCalls: [...s.toolCalls, { ...r, index: s.toolCalls.length + 1 }] });
export const addError = (s: AgentState, e: AgentError): AgentState => ({ ...s, errors: [...s.errors, e] });
export const terminate = (s: AgentState, reason: TerminationReason): AgentState => (s.termination ? s : { ...s, termination: reason, currentStep: null });
export const isTerminated = (s: AgentState) => s.termination !== null;

export const setScholarship = (s: AgentState, sc: ScholarshipData): AgentState => ({ ...s, scholarship: sc, scholarshipId: sc.id.toLowerCase() });
export const setProfile = (s: AgentState, p: AgentProfile): AgentState => ({ ...s, profile: p });
export const setDocuments = (s: AgentState, d: DocumentMeta[]): AgentState => ({ ...s, documents: d });
export const setEligibility = (s: AgentState, e: EligibilityData): AgentState => ({ ...s, eligibility: e, missing: mergeMissing(s.missing, e.missing) });
export const addEvidence = (s: AgentState, items: EvidenceItem[]): AgentState => {
  const seen = new Set(s.retrievedEvidence.map((e) => e.chunkId));
  return { ...s, retrievedEvidence: [...s.retrievedEvidence, ...items.filter((i) => !seen.has(i.chunkId))] };
};
export const addTask = (s: AgentState, t: TaskData): AgentState => (s.createdTasks.some((x) => x.id === t.id) ? s : { ...s, createdTasks: [...s.createdTasks, t] });
export const setRoadmap = (s: AgentState, r: RoadmapData, kind: "created" | "updated"): AgentState => ({ ...s, roadmap: r, roadmapChanges: [...s.roadmapChanges, { kind, roadmapId: r.id, title: r.title }] });
export const addApproval = (s: AgentState, a: ApprovalRequest): AgentState => ({ ...s, approvalRequests: [...s.approvalRequests, a] });
export const setDiscovery = (s: AgentState, d: DiscoveryResult): AgentState => ({ ...s, discovery: d });
export const setFinal = (s: AgentState, f: FinalReport): AgentState => ({ ...s, finalResponse: f });

export function mergeMissing(a: readonly MissingInfo[], b: readonly MissingInfo[]): MissingInfo[] {
  const key = (m: MissingInfo) => `${m.where}|${m.what.toLowerCase()}`;
  const seen = new Set(a.map(key));
  return [...a, ...b.filter((m) => !seen.has(key(m)) && seen.add(key(m)))];
}
export const addMissing = (s: AgentState, m: readonly MissingInfo[]): AgentState => ({ ...s, missing: mergeMissing(s.missing, m) });

/** Evidence/context budget: counts characters of everything the loop keeps or sends onward. */
export const evidenceBudgetExceeded = (s: AgentState) => s.counters.evidenceChars > AGENT_CONFIG.limits.maxEvidenceChars;
