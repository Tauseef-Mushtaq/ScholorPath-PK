import { AGENT_CONFIG } from "./config";
import { lookupTool, type ToolDefinition } from "./tools";
import type { AgentState, AutonomyLevel, ExecutableToolName, ToolErrorCode } from "./types";

/**
 * The server-side policy layer. The model PROPOSES; this function DECIDES. Order matters and is pinned by tests:
 *   registry lookup -> forbidden -> allowed -> identity -> autonomy -> run limits -> input validation -> scholarship scope -> approval.
 * Nothing the model (or retrieved text) says can change the outcome: the decision depends only on the registry,
 * the server session identity carried in `state`, the run counters and the validated input.
 */
export type PolicyDecision =
  | { kind: "reject"; code: ToolErrorCode }
  | { kind: "execute"; def: ToolDefinition; name: ExecutableToolName; input: unknown }
  | { kind: "approval"; def: ToolDefinition; name: ExecutableToolName; input: unknown };

const RANK: Record<AutonomyLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };

/** `allowed` narrows what a MODEL proposal may name at this point of the plan (e.g. only searchRag during retrieval). */
export function decideToolCall(proposal: { tool: unknown; input: unknown }, state: AgentState, allowed?: readonly ExecutableToolName[]): PolicyDecision {
  const def = lookupTool(proposal.tool);
  if (!def) return { kind: "reject", code: "unknown_tool" };
  if (def.risk === "FORBIDDEN") return { kind: "reject", code: "forbidden_tool" };
  if (allowed && !(allowed as readonly string[]).includes(def.name)) return { kind: "reject", code: "not_allowed_now" };
  if (!state.userId) return { kind: "reject", code: "unauthorized" };
  if (RANK[state.autonomy] < RANK[def.minAutonomy]) return { kind: "reject", code: "not_allowed_now" };
  if (state.counters.toolCalls >= AGENT_CONFIG.limits.maxToolCalls) return { kind: "reject", code: "limit_reached" };
  const parsed = def.parseInput(proposal.input);
  if (!parsed.ok) return { kind: "reject", code: "invalid_input" };
  // One scholarship per run: once identified, no tool may be pointed at a different one.
  const v = parsed.value as { scholarshipId?: string };
  if (v.scholarshipId !== undefined && state.scholarshipId !== null && v.scholarshipId !== state.scholarshipId) return { kind: "reject", code: "not_allowed_now" };
  if (def.name === "createTask" && state.createdTasks.length >= AGENT_CONFIG.task.maxCreatedPerRun) return { kind: "reject", code: "limit_reached" };
  const name = def.name as ExecutableToolName;
  if (def.risk === "APPROVAL_REQUIRED") return { kind: "approval", def, name, input: parsed.value };
  return { kind: "execute", def, name, input: parsed.value };
}
