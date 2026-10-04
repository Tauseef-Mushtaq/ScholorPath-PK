import type { GenerationProvider } from "../assistant/generation";
import { createApprovalRequest, verifyApprovalToken, type ApprovalSigner } from "./approval";
import { AGENT_CONFIG } from "./config";
import { decideDiscovery, invalidCriteriaResult } from "./discovery";
import { callModel, criteriaPrompt, parseCalls, parseCriteria, parsePlan, parseReview, parseSummary, planPrompt, ragPrompt, reviewPrompt, stateDigest, summaryPrompt } from "./model";
import { applyModelPlan, scholarshipQueryFromGoal } from "./plan";
import { decideToolCall } from "./policy";
import { buildReport, deriveGaps, roadmapSteps, taskCandidates } from "./report";
import { isAgentProfile } from "./profile";
import * as S from "./state";
import { lookupTool } from "./tools";
import type { AgentState, ExecutableToolName, FinalReport, PlanStepId, SearchCriteria, SearchData, TerminationReason, ToolCallRecord, ToolContext, ToolErrorCode, ToolExecutors, ToolResult } from "./types";
import { isRecord, uuidField } from "./validators";

export type AgentDeps = {
  executors: ToolExecutors;
  /** The Module 12 generation provider (no second Gemini client). */
  generator: GenerationProvider;
  signer: ApprovalSigner;
  nowMs: () => number;
  todayIso: string;
  nonce: () => string;
};
export type RunInput = { userId: string; goal: string; scholarshipId: string | null };

type Exec = { state: AgentState; ok: boolean; code: ToolErrorCode | null; result: ToolResult | null; awaiting: boolean };

const short = (v: unknown) => { try { return JSON.stringify(v).slice(0, 120); } catch { return ""; } };

const validCandidate = (c: unknown): boolean =>
  isRecord(c) && uuidField(c.id) !== null && typeof c.name === "string" && typeof c.provider === "string" && typeof c.degreeLevel === "string"
  && (c.deadline === null || typeof c.deadline === "string") && (c.field === null || typeof c.field === "string");
const strings = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === "string");
/** A search result must be real, bounded rows with a coherent count and well-formed applied criteria (nothing else may enter state). */
function validSearch(d: Record<string, unknown>): boolean {
  if (!Array.isArray(d.items) || d.items.length > AGENT_CONFIG.search.maxLimit || !d.items.every(validCandidate)) return false;
  if (typeof d.total !== "number" || !Number.isFinite(d.total) || d.total < d.items.length) return false;
  const a = d.applied;
  if (!isRecord(a) || !strings(a.keywords) || !strings(a.degree) || typeof a.openOnly !== "boolean") return false;
  if (!Array.isArray(d.unresolved) || !d.unresolved.every((u) => isRecord(u) && (u.criterion === "country" || u.criterion === "degree") && typeof u.requested === "string")) return false;
  return strings(d.dropped);
}

/** Output shape validation: executors are trusted code, but their output still must match the contract before it enters state. */
function validOutput(name: ExecutableToolName, input: unknown, r: unknown): r is ToolResult {
  if (!isRecord(r) || typeof r.ok !== "boolean" || r.tool !== name) return false;
  if (!r.ok) return typeof r.error === "string";
  const d = r.data;
  if (!isRecord(d)) return false;
  const i = isRecord(input) ? input : {};
  switch (name) {
    case "getScholarship": return isRecord(d.scholarship) && d.scholarship.id === i.scholarshipId && Array.isArray(d.scholarship.requirements);
    case "searchScholarships": return validSearch(d);
    case "getStudentProfile": return isAgentProfile(d.profile);
    case "getStudentDocuments": return Array.isArray(d.documents);
    case "checkEligibility": return isRecord(d.eligibility) && d.eligibility.scholarshipId === i.scholarshipId && typeof d.eligibility.status === "string" && Array.isArray(d.eligibility.checks);
    case "searchRag": return Array.isArray(d.evidence) && d.evidence.length <= AGENT_CONFIG.rag.maxLimit && d.evidence.every((e) => isRecord(e) && typeof e.chunkId === "string" && typeof e.sourceUrl === "string" && typeof e.excerpt === "string");
    case "createTask": case "updateTask": return isRecord(d.task) && typeof d.task.id === "string";
    case "createRoadmap": case "updateRoadmap": return isRecord(d.roadmap) && typeof d.roadmap.id === "string";
    default: return true;
  }
}

/** The ONLY path to an executor. Policy decides; approval-gated calls never execute here. */
async function execTool(state: AgentState, proposal: { tool: unknown; input: unknown }, deps: AgentDeps, fromModel: boolean): Promise<Exec> {
  const decision = decideToolCall(proposal, state, fromModel ? MODEL_MAY_PROPOSE : undefined);
  const toolName = typeof proposal.tool === "string" ? proposal.tool.slice(0, 40) : "invalid";
  const rec = (s: AgentState, status: ToolCallRecord["status"], error: ToolErrorCode | null, summary: string) => S.recordToolCall(s, { tool: toolName, status, error, summary });
  if (decision.kind === "reject") {
    let s = rec(state, "rejected", decision.code, short(proposal.input));
    if (fromModel) s = S.bump(s, "rejectedProposals");
    return { state: s, ok: false, code: decision.code, result: null, awaiting: false };
  }
  if (decision.kind === "approval") {
    const req = createApprovalRequest({ signer: deps.signer, userId: state.userId, tool: decision.name, input: decision.input, summary: decision.def.summarize(decision.input), nowMs: deps.nowMs(), nonce: deps.nonce() });
    const s = rec(S.addApproval(state, req), "awaiting_approval", "approval_required", decision.def.summarize(decision.input));
    return { state: s, ok: false, code: "approval_required", result: null, awaiting: true };
  }
  let s = S.bump(state, "toolCalls");
  const ctx: ToolContext = { userId: state.userId, todayIso: deps.todayIso };
  let raw: unknown;
  try { raw = await (deps.executors[decision.name] as (i: unknown, c: ToolContext) => Promise<unknown>)(decision.input, ctx); } catch { raw = null; }
  if (!validOutput(decision.name, decision.input, raw)) {
    s = rec(s, "failed", "invalid_output", decision.def.summarize(decision.input));
    return { state: S.addError(s, { code: "invalid_output", step: s.currentStep, tool: decision.name }), ok: false, code: "invalid_output", result: null, awaiting: false };
  }
  if (!raw.ok) {
    s = rec(s, "failed", raw.error, decision.def.summarize(decision.input));
    return { state: s, ok: false, code: raw.error, result: raw, awaiting: false };
  }
  s = rec(s, "executed", null, decision.def.summarize(decision.input));
  s = S.bump(s, "evidenceChars", JSON.stringify(raw.data).length);
  return { state: s, ok: true, code: null, result: raw, awaiting: false };
}

/** Model proposals are only accepted for these tools, and only in the retrieval step. Everything else is server-derived. */
const MODEL_MAY_PROPOSE: readonly ExecutableToolName[] = ["searchRag"];
const TERMINAL_FOR: Partial<Record<ToolErrorCode, TerminationReason>> = { limit_reached: "max_tool_calls" };

/** A number in model wording must appear in the state digest; otherwise the wording is dropped (unsupported claim). */
export function summaryIsGrounded(summary: string, digest: string): boolean {
  const nums = summary.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return nums.every((n) => digest.includes(n));
}

export async function runAgent(input: RunInput, deps: AgentDeps): Promise<AgentState> {
  const start = deps.nowMs();
  let s = S.createInitialState(input);

  if (s.goalKind === "discover_scholarships") return runDiscovery(input, deps);
  if (s.goalKind !== "prepare_scholarship") return finish(S.terminate(s, "goal_unsupported"), deps, null);   // no model call, no tool call

  // --- model call 1: which OPTIONAL steps are useful (required steps are always kept)
  s = S.bump(s, "modelCalls");
  const planOut = await callModel(deps.generator, planPrompt(s));
  if (!planOut.ok && planOut.code === "unavailable") return finish(S.terminate(S.addError(s, { code: "model_unavailable", step: null, tool: null }), "model_unavailable"), deps, null);
  const proposed = planOut.ok ? parsePlan(planOut.text) : null;
  if (proposed) { const plan = applyModelPlan(proposed); s = { ...s, plan, pendingSteps: plan.map((p) => p.id) }; }
  else s = S.addError(s, { code: "model_invalid_output", step: null, tool: null });   // fall back to the full canonical plan

  while (!S.isTerminated(s)) {
    const step = S.nextPendingStep(s);
    if (!step) break;
    if (s.counters.iterations >= AGENT_CONFIG.limits.maxIterations) { s = S.terminate(s, "max_iterations"); break; }
    if (deps.nowMs() - start > AGENT_CONFIG.limits.maxExecutionMs) { s = S.terminate(s, "max_execution_time"); break; }
    if (S.evidenceBudgetExceeded(s)) { s = S.terminate(s, "max_evidence"); break; }
    if (s.counters.rejectedProposals >= AGENT_CONFIG.limits.maxRejectedProposals) { s = S.terminate(s, "too_many_rejected_proposals"); break; }
    s = S.bump(S.beginStep(s, step), "iterations");
    s = await runStep(s, step, deps);
  }

  let summary: string | null = null;
  if (!s.termination || s.termination === "completed") summary = await modelSummary(s, deps);
  if (!s.termination) s = S.terminate(s, s.approvalRequests.length ? "awaiting_approval" : "completed");
  return finish(s, deps, summary);
}

/** One search through the policy-guarded path. The TOOL is chosen here, by the server; the model only supplied criteria data. */
async function searchByCriteria(s: AgentState, criteria: SearchCriteria, deps: AgentDeps): Promise<{ state: AgentState; data: SearchData | null; code: ToolErrorCode | null }> {
  const r = await execTool(s, { tool: "searchScholarships", input: { ...criteria, limit: AGENT_CONFIG.search.maxLimit } }, deps, false);
  if (r.ok && r.result?.ok) return { state: r.state, data: r.result.data as SearchData, code: null };
  return { state: r.state, data: null, code: r.code };
}

/**
 * Discovery goal ("find fully funded Master's scholarships in Germany for Computer Science"). Read-only: one model call that
 * returns criteria data, one validated database search, no mutation of any kind. Several matches are returned for the student
 * to choose from; the agent never picks one. If the model is unavailable or returns unusable criteria the run stops honestly.
 */
async function runDiscovery(input: RunInput, deps: AgentDeps): Promise<AgentState> {
  let s = S.createInitialState({ ...input, scholarshipId: null });   // a scholarship id has no meaning for a search
  s = S.bump(S.bump(S.beginStep(s, "interpret_request"), "iterations"), "modelCalls");
  const out = await callModel(deps.generator, criteriaPrompt(s.goal));
  if (!out.ok && out.code === "unavailable") return finish(S.terminate(S.failStep(s, "interpret_request", { code: "model_unavailable", step: "interpret_request", tool: null }), "model_unavailable"), deps, null);
  const criteria = out.ok ? parseCriteria(out.text) : null;
  if (!criteria) return finish(S.terminate(S.setDiscovery(S.failStep(s, "interpret_request", { code: "model_invalid_output", step: "interpret_request", tool: null }), invalidCriteriaResult()), "invalid_criteria"), deps, null);
  s = S.completeStep(s, "interpret_request");

  const found = await searchByCriteria(S.bump(S.beginStep(s, "search_catalog"), "iterations"), criteria, deps);
  s = found.state;
  if (!found.data) return finish(S.terminate(S.failStep(s, "search_catalog", { code: found.code ?? "failed", step: "search_catalog", tool: null }), (found.code && TERMINAL_FOR[found.code]) || "tool_failure"), deps, null);
  const result = decideDiscovery(found.data);
  s = S.completeStep(S.setDiscovery(s, result), "search_catalog");
  return finish(S.terminate(s, result.state === "selection_required" ? "selection_required" : result.state === "no_results" ? "no_results" : "completed"), deps, null);
}

function finish(s: AgentState, deps: AgentDeps, summary: string | null): AgentState {
  return S.setFinal(s, buildReport(s, summary, deps.todayIso));
}

async function modelSummary(s: AgentState, deps: AgentDeps): Promise<string | null> {
  if (s.counters.modelCalls >= AGENT_CONFIG.limits.maxModelCalls || !s.scholarship) return null;
  const out = await callModel(deps.generator, summaryPrompt(s));
  if (!out.ok) return null;
  const text = parseSummary(out.text);
  return text && summaryIsGrounded(text, stateDigest(s)) ? text : null;
}

async function runStep(s0: AgentState, step: PlanStepId, deps: AgentDeps): Promise<AgentState> {
  let s = s0;
  const fail = (code: ToolErrorCode) => S.failStep(s, step, { code, step, tool: null });
  switch (step) {
    case "identify_scholarship": {
      if (s.scholarshipId) {
        const r = await execTool(s, { tool: "getScholarship", input: { scholarshipId: s.scholarshipId } }, deps, false);
        s = r.state;
        if (r.ok && r.result?.ok) return S.completeStep(S.setScholarship(s, (r.result.data as { scholarship: never }).scholarship), step);
        // A scholarship hidden from this student is indistinguishable from a missing one (no existence leak).
        const hidden = r.code === "not_found" || r.code === "unauthorized";
        return S.terminate(S.failStep(s, step, { code: hidden ? "not_found" : (r.code ?? "failed"), step, tool: null }), hidden ? "scholarship_not_found" : (r.code && TERMINAL_FOR[r.code]) || "tool_failure");
      }
      const q = scholarshipQueryFromGoal(s.goal);
      if (!q) return S.terminate(fail("not_found"), "scholarship_not_identified");
      // The model may describe the request as structured criteria (validated like any discovery request). If it cannot, fall
      // back to the plain words of the goal. Either way the EXISTING search runs and the database decides what exists.
      let criteria: SearchCriteria | null = null;
      if (s.counters.modelCalls < AGENT_CONFIG.limits.maxModelCalls) {
        s = S.bump(s, "modelCalls");
        const out = await callModel(deps.generator, criteriaPrompt(s.goal));
        criteria = out.ok ? parseCriteria(out.text) : null;
      }
      const found = await searchByCriteria(s, criteria ?? { query: q, country: null, degree: null, field: null, funding: null, deadlineDays: null, openOnly: false }, deps);
      s = found.state;
      if (!found.data) return S.terminate(S.failStep(s, step, { code: found.code ?? "failed", step, tool: null }), (found.code && TERMINAL_FOR[found.code]) || "tool_failure");
      const result = decideDiscovery(found.data);
      s = S.setDiscovery(s, result);
      // Several matches: NEVER pick one silently. None: a correct "no results". Both keep the candidates for the student.
      if (result.state === "selection_required") return S.terminate(S.pauseStep(s, step), "selection_required");
      if (result.state === "no_results") return S.terminate(S.pauseStep(s, step), "no_results");
      s = { ...s, scholarshipId: result.selectedId };
      const g = await execTool(s, { tool: "getScholarship", input: { scholarshipId: result.selectedId } }, deps, false);
      s = g.state;
      if (g.ok && g.result?.ok) return S.completeStep(S.setScholarship(s, (g.result.data as { scholarship: never }).scholarship), step);
      return S.terminate(fail(g.code ?? "failed"), "scholarship_not_found");
    }
    case "retrieve_requirements": {
      if (!s.scholarship) return S.terminate(fail("not_found"), "scholarship_not_identified");
      return S.completeStep({ ...s, requirements: s.scholarship.requirements }, step);   // from the official record; nothing is invented
    }
    case "inspect_profile": {
      const r = await execTool(s, { tool: "getStudentProfile", input: {} }, deps, false); s = r.state;
      if (r.ok && r.result?.ok) return S.completeStep(S.setProfile(s, (r.result.data as { profile: never }).profile), step);
      return failOrStop(s, step, r);
    }
    case "inspect_documents": {
      const r = await execTool(s, { tool: "getStudentDocuments", input: {} }, deps, false); s = r.state;
      if (r.ok && r.result?.ok) return S.completeStep(S.setDocuments(s, (r.result.data as { documents: never }).documents), step);
      return failOrStop(s, step, r);
    }
    case "check_eligibility": {
      const r = await execTool(s, { tool: "checkEligibility", input: { scholarshipId: s.scholarshipId } }, deps, false); s = r.state;
      if (r.ok && r.result?.ok) return S.completeStep(S.setEligibility(s, (r.result.data as { eligibility: never }).eligibility), step);
      return failOrStop(s, step, r);
    }
    case "search_verified_knowledge": return ragStep(s, step, deps);
    case "identify_gaps": return S.completeStep(S.addMissing(s, deriveGaps(s)), step);
    case "create_tasks": {
      for (const c of taskCandidates(s, deps.todayIso)) {
        const r = await execTool(s, { tool: "createTask", input: { scholarshipId: s.scholarshipId, title: c.title, description: c.description, dueDate: c.dueDate, required: c.required } }, deps, false); s = r.state;
        if (r.ok && r.result?.ok) s = S.addTask(s, (r.result.data as { task: never }).task);
        else if (r.code === "limit_reached") { s = r.code && TERMINAL_FOR[r.code] ? S.terminate(s, TERMINAL_FOR[r.code]!) : s; break; }
      }
      return s.termination ? s : S.completeStep(s, step);
    }
    case "build_roadmap": {
      const rm = roadmapSteps(s, deps.todayIso);
      const c = await execTool(s, { tool: "createRoadmap", input: { scholarshipId: s.scholarshipId, title: rm.title, summary: rm.summary, steps: rm.steps } }, deps, false); s = c.state;
      if (c.ok && c.result?.ok) return S.completeStep(S.setRoadmap(s, (c.result.data as { roadmap: never }).roadmap, "created"), step);
      if (c.code === "not_allowed_now" && c.result && !c.result.ok && c.result.existingId) {
        // A roadmap already exists: changing it needs the student's explicit approval (decided by policy, not by the model).
        const u = await execTool(s, { tool: "updateRoadmap", input: { roadmapId: c.result.existingId, title: null, summary: null, steps: rm.steps } }, deps, false); s = u.state;
        return u.awaiting ? S.completeStep(s, step) : failOrStop(s, step, u);
      }
      return failOrStop(s, step, c);
    }
    case "summarize": return S.completeStep(s, step);
    // Discovery-only steps are driven by runDiscovery, never by the preparation loop: fail closed if one ever appears here.
    case "interpret_request": case "search_catalog": return fail("not_allowed_now");
  }
}

function failOrStop(s: AgentState, step: PlanStepId, r: Exec): AgentState {
  const failed = S.failStep(s, step, { code: r.code ?? "failed", step, tool: null });
  const t = r.code ? TERMINAL_FOR[r.code] : undefined;
  return t ? S.terminate(failed, t) : failed;
}

const DEFAULT_RAG_QUERY = "eligibility requirements required documents and application deadline";

async function ragStep(s0: AgentState, step: PlanStepId, deps: AgentDeps): Promise<AgentState> {
  let s = s0;
  let proposals: { tool: unknown; input: unknown }[] = [];
  if (s.counters.modelCalls < AGENT_CONFIG.limits.maxModelCalls) {
    s = S.bump(s, "modelCalls");
    const out = await callModel(deps.generator, ragPrompt(s));
    const parsed = out.ok ? parseCalls(out.text) : null;
    if (parsed) proposals = parsed.slice(0, 2);
    else s = S.addError(s, { code: "model_invalid_output", step, tool: null });
  }
  let ran = 0;
  for (const p of proposals) {
    const r = await execTool(s, p, deps, true); s = r.state;   // fromModel: a rejected proposal counts toward the cap
    if (r.ok && r.result?.ok) { s = S.addEvidence(s, (r.result.data as { evidence: never[] }).evidence); ran++; }
    else if (r.code === "limit_reached") return S.terminate(s, "max_tool_calls");
    if (s.counters.rejectedProposals >= AGENT_CONFIG.limits.maxRejectedProposals) return S.terminate(s, "too_many_rejected_proposals");
  }
  if (ran === 0) {   // safe default: the server's own query, scoped to the identified scholarship
    const r = await execTool(s, { tool: "searchRag", input: { scholarshipId: s.scholarshipId, query: DEFAULT_RAG_QUERY, limit: AGENT_CONFIG.rag.defaultLimit } }, deps, false); s = r.state;
    if (r.ok && r.result?.ok) s = S.addEvidence(s, (r.result.data as { evidence: never[] }).evidence);
    else if (r.code === "limit_reached") return S.terminate(s, "max_tool_calls");
  }
  // Evidence review: conflicts are surfaced, never silently resolved.
  const ev = s.retrievedEvidence;
  if (ev.length >= 2 && s.counters.modelCalls < AGENT_CONFIG.limits.maxModelCalls) {
    s = S.bump(s, "modelCalls");
    const out = await callModel(deps.generator, reviewPrompt(s, ev));
    const findings = out.ok ? parseReview(out.text, ev.length) : null;
    if (findings) {
      const conflicts = findings.filter((f) => f.status === "conflicting").map((f) => ({
        topic: f.topic, code: "CONFLICTING_INFORMATION" as const,
        evidence: f.evidence.map((n) => ({ sourceId: ev[n - 1].sourceId, sourceName: ev[n - 1].sourceName, sourceUrl: ev[n - 1].sourceUrl, excerpt: ev[n - 1].excerpt })),
      }));
      s = { ...s, conflicts: [...s.conflicts, ...conflicts] };
    } else s = S.addError(s, { code: "model_invalid_output", step, tool: null });
  }
  return S.completeStep(s, step);
}

// ---------------------------------------------------------------------------------------------------------------
// Approval continuation (interface for the future workflow; executes exactly one previously approved, signed action)
// ---------------------------------------------------------------------------------------------------------------
export type ResumeResult =
  | { status: "declined" }
  | { status: "executed"; tool: ExecutableToolName; result: ToolResult }
  | { status: "rejected"; code: "invalid_token" | "expired" | "wrong_user" | "invalid_input" | "failed" };

export async function resumeApproval(args: { userId: string; token: unknown; decision: "approve" | "decline" }, deps: AgentDeps): Promise<ResumeResult> {
  const v = verifyApprovalToken(args.token, args.userId, deps.nowMs(), deps.signer);
  if (!v.ok) return { status: "rejected", code: v.code };
  if (args.decision === "decline") return { status: "declined" };
  const def = lookupTool(v.tool);
  if (!def || def.risk !== "APPROVAL_REQUIRED") return { status: "rejected", code: "invalid_token" };
  const parsed = def.parseInput(v.input);   // re-validate even though the server signed it
  if (!parsed.ok) return { status: "rejected", code: "invalid_input" };
  try {
    const raw = await (deps.executors[v.tool] as (i: unknown, c: ToolContext) => Promise<unknown>)(parsed.value, { userId: args.userId, todayIso: deps.todayIso });
    if (!validOutput(v.tool, parsed.value, raw)) return { status: "rejected", code: "failed" };
    return { status: "executed", tool: v.tool, result: raw };
  } catch { return { status: "rejected", code: "failed" }; }
}

// ---------------------------------------------------------------------------------------------------------------
// Public (browser-safe) view of a run
// ---------------------------------------------------------------------------------------------------------------
export type PublicRun = {
  status: "completed" | "awaiting_approval" | "needs_selection" | "stopped";
  termination: TerminationReason;
  goalKind: AgentState["goalKind"];
  plan: { id: PlanStepId; label: string; status: string }[];
  activity: { label: string; status: ToolCallRecord["status"] }[];
  approvals: { id: string; tool: ExecutableToolName; summary: string; token: string; expiresAt: string }[];
  report: FinalReport | null;
  errors: string[];
};

export function toPublicRun(s: AgentState): PublicRun {
  const termination = s.termination ?? "tool_failure";
  return {
    status: termination === "completed" || termination === "no_results" ? "completed" : termination === "awaiting_approval" ? "awaiting_approval" : termination === "selection_required" ? "needs_selection" : "stopped",
    termination, goalKind: s.goalKind,
    plan: s.plan.map((p) => ({ id: p.id, label: p.label, status: p.status })),
    activity: s.toolCalls.map((c) => ({ label: lookupTool(c.tool)?.label ?? "Action", status: c.status })),
    approvals: s.approvalRequests.map((a) => ({ id: a.id, tool: a.tool, summary: a.summary, token: a.token, expiresAt: a.expiresAt })),
    report: s.finalResponse,
    errors: Array.from(new Set(s.errors.map((e) => e.code))),
  };
}
