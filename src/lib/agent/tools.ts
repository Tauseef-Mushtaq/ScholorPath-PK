import { AGENT_CONFIG } from "./config";
import type { AutonomyLevel, ExecutableToolName, RiskLevel, RoadmapStepInput, TaskStatus, ToolInputs, ToolName } from "./types";
import { parseCriteriaFields, describeCriteria } from "./discovery";
import { intInRange, isoDate, isRecord, optDate, optText, textField, uuidField, type Parsed } from "./validators";

/**
 * The ONLY source of truth for what the agent may do. The model supplies a tool NAME and a JSON input; both are
 * looked up / validated here. A name that is not an own key of the registry never reaches an executor.
 */
export type ToolDefinition = {
  name: ToolName;
  description: string;
  risk: RiskLevel;
  /** Every tool requires an authenticated student; identity is taken from the session, never from input. */
  requiresAuth: true;
  /** Minimum autonomy level of the run that may use this tool. */
  minAutonomy: AutonomyLevel;
  /** User-facing label (no internal details). */
  label: string;
  parseInput(raw: unknown): Parsed<unknown>;
  summarize(input: unknown): string;
};

/** Tools without parameters ignore any supplied fields (nothing the model sends is forwarded). */
const none = (raw: unknown): Parsed<Record<string, never>> => (raw === undefined || raw === null || isRecord(raw) ? { ok: true, value: {} } : { ok: false });
const scholarshipOnly = (raw: unknown): Parsed<{ scholarshipId: string }> => {
  if (!isRecord(raw)) return { ok: false };
  const id = uuidField(raw.scholarshipId);
  return id ? { ok: true, value: { scholarshipId: id } } : { ok: false };
};
const STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "done", "skipped"];

function parseSteps(raw: unknown): Parsed<RoadmapStepInput[]> {
  const r = AGENT_CONFIG.roadmap;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > r.maxSteps) return { ok: false };
  const out: RoadmapStepInput[] = [];
  for (const s of raw) {
    if (!isRecord(s)) return { ok: false };
    const title = textField(s.title, 1, r.stepTitleMax); const d = optText(s.description, r.stepDescriptionMax); const date = optDate(s.targetDate);
    if (!title || !d.ok || !date.ok) return { ok: false };
    out.push({ title, description: d.value, targetDate: date.value });
  }
  return { ok: true, value: out };
}

const def = <K extends ExecutableToolName>(d: {
  name: K; description: string; risk: RiskLevel; minAutonomy: AutonomyLevel; label: string;
  parse: (raw: unknown) => Parsed<ToolInputs[K]>; summarize: (i: ToolInputs[K]) => string;
}): ToolDefinition => ({
  name: d.name, description: d.description, risk: d.risk, requiresAuth: true, minAutonomy: d.minAutonomy, label: d.label,
  parseInput: d.parse, summarize: (i) => d.summarize(i as ToolInputs[K]),
});

const forbidden = (name: ToolName, description: string): ToolDefinition => ({
  name, description, risk: "FORBIDDEN", requiresAuth: true, minAutonomy: "L3", label: "Not permitted",
  parseInput: () => ({ ok: false }), summarize: () => "forbidden action",
});

const t = AGENT_CONFIG.task, rm = AGENT_CONFIG.roadmap;

const DEFINITIONS: ToolDefinition[] = [
  def({ name: "searchScholarships", label: "Searching scholarships", risk: "READ_ONLY", minAutonomy: "L1", description: "Search the scholarship database with validated structured criteria (country, degree, field, funding, deadline, keywords).",
    parse: (raw) => { if (!isRecord(raw)) return { ok: false }; const c = parseCriteriaFields(raw); const l = intInRange(raw.limit, 1, AGENT_CONFIG.search.maxLimit, AGENT_CONFIG.search.defaultLimit);
      return c.ok && l !== null ? { ok: true, value: { ...c.value, limit: l } } : { ok: false }; },
    summarize: (i) => `search scholarships (${describeCriteria({ keywords: i.query ? [i.query] : [], country: i.country, degree: i.degree ? [i.degree] : [], field: i.field ? { value: i.field, mode: "exact" } : null, funding: i.funding, deadlineDays: i.deadlineDays, openOnly: i.openOnly })})` }),
  def({ name: "getScholarship", label: "Reading scholarship details", risk: "READ_ONLY", minAutonomy: "L1", description: "Load one scholarship and its documented requirements.",
    parse: scholarshipOnly, summarize: () => "read the scholarship record" }),
  def({ name: "getStudentProfile", label: "Reviewing your profile", risk: "READ_ONLY", minAutonomy: "L1", description: "Read the signed-in student's own stored profile: personal details, education and experience (no input; the student is always the signed-in one).",
    parse: none, summarize: () => "read your profile" }),
  def({ name: "getStudentDocuments", label: "Reviewing your documents", risk: "READ_ONLY", minAutonomy: "L1", description: "List metadata of the signed-in student's own documents (never file contents).",
    parse: none, summarize: () => "list your document metadata" }),
  def({ name: "checkEligibility", label: "Checking eligibility", risk: "READ_ONLY", minAutonomy: "L1", description: "Evaluate the student's known data against the scholarship's documented criteria.",
    parse: scholarshipOnly, summarize: () => "check eligibility" }),
  def({ name: "searchRag", label: "Searching verified sources", risk: "READ_ONLY", minAutonomy: "L1", description: "Search verified knowledge sources of ONE scholarship.",
    parse: (raw) => { if (!isRecord(raw)) return { ok: false }; const id = uuidField(raw.scholarshipId); const q = textField(raw.query, 3, 300);
      const l = intInRange(raw.limit, 1, AGENT_CONFIG.rag.maxLimit, AGENT_CONFIG.rag.defaultLimit);
      return id && q && l !== null ? { ok: true, value: { scholarshipId: id, query: q, limit: l } } : { ok: false }; },
    summarize: (i) => `search verified sources for "${i.query}"` }),
  def({ name: "analyzeDocument", label: "Analysing a document", risk: "READ_ONLY", minAutonomy: "L1", description: "Analyse one of the student's own documents. Returns a structured failure when analysis is unsupported.",
    parse: (raw) => { if (!isRecord(raw)) return { ok: false }; const id = uuidField(raw.documentId); return id ? { ok: true, value: { documentId: id } } : { ok: false }; },
    summarize: () => "analyse a document" }),
  def({ name: "createTask", label: "Creating a preparation task", risk: "LOW_RISK_MUTATION", minAutonomy: "L2", description: "Create one preparation task for the student on this scholarship.",
    parse: (raw) => { if (!isRecord(raw)) return { ok: false }; const id = uuidField(raw.scholarshipId); const title = textField(raw.title, 3, t.titleMax);
      const d = optText(raw.description, t.descriptionMax); const due = optDate(raw.dueDate);
      if (!id || !title || !d.ok || !due.ok || (raw.required !== undefined && typeof raw.required !== "boolean")) return { ok: false };
      return { ok: true, value: { scholarshipId: id, title, description: d.value, dueDate: due.value, required: raw.required !== false } }; },
    summarize: (i) => `create the task "${i.title}"` }),
  def({ name: "updateTask", label: "Updating a task", risk: "APPROVAL_REQUIRED", minAutonomy: "L2", description: "Change an existing task of the student.",
    parse: (raw) => { if (!isRecord(raw)) return { ok: false }; const id = uuidField(raw.taskId);
      const status = raw.status === undefined || raw.status === null ? null : (STATUSES as readonly unknown[]).includes(raw.status) ? (raw.status as TaskStatus) : undefined;
      const title = raw.title === undefined || raw.title === null ? null : textField(raw.title, 3, t.titleMax);
      const d = optText(raw.description, t.descriptionMax); const due = optDate(raw.dueDate);
      if (!id || status === undefined || title === undefined || !d.ok || !due.ok) return { ok: false };
      if (status === null && title === null && d.value === null && due.value === null) return { ok: false };
      return { ok: true, value: { taskId: id, status, title, description: d.value, dueDate: due.value } }; },
    summarize: (i) => `update task ${i.taskId.slice(0, 8)}${i.status ? ` (status: ${i.status})` : ""}` }),
  def({ name: "createRoadmap", label: "Building your roadmap", risk: "LOW_RISK_MUTATION", minAutonomy: "L2", description: "Create the preparation roadmap for this scholarship (only when none exists).",
    parse: (raw) => { if (!isRecord(raw)) return { ok: false }; const id = uuidField(raw.scholarshipId); const title = textField(raw.title, 3, rm.titleMax);
      const s = optText(raw.summary, rm.summaryMax); const steps = parseSteps(raw.steps);
      return id && title && s.ok && steps.ok ? { ok: true, value: { scholarshipId: id, title, summary: s.value, steps: steps.value } } : { ok: false }; },
    summarize: (i) => `create the roadmap "${i.title}" with ${i.steps.length} steps` }),
  def({ name: "updateRoadmap", label: "Updating your roadmap", risk: "APPROVAL_REQUIRED", minAutonomy: "L2", description: "Change an existing roadmap of the student.",
    parse: (raw) => { if (!isRecord(raw)) return { ok: false }; const id = uuidField(raw.roadmapId);
      const title = raw.title === undefined || raw.title === null ? null : textField(raw.title, 3, rm.titleMax);
      const s = optText(raw.summary, rm.summaryMax);
      const steps = raw.steps === undefined || raw.steps === null ? ({ ok: true, value: null } as const) : parseSteps(raw.steps);
      if (!id || title === undefined || !s.ok || !steps.ok) return { ok: false };
      if (title === null && s.value === null && steps.value === null) return { ok: false };
      return { ok: true, value: { roadmapId: id, title, summary: s.value, steps: steps.value } }; },
    summarize: (i) => `update roadmap ${i.roadmapId.slice(0, 8)}${i.steps ? ` (${i.steps.length} steps)` : ""}` }),
  forbidden("submitApplication", "Submitting an official application. Never permitted."),
  forbidden("sendEmail", "Sending email. Never permitted."),
  forbidden("sendMessage", "Messaging a university or any third party. Never permitted."),
  forbidden("signDocument", "Signing a document. Never permitted."),
  forbidden("acceptTerms", "Accepting legal terms. Never permitted."),
  forbidden("makePayment", "Making a payment. Never permitted."),
];

const REGISTRY: Readonly<Record<string, ToolDefinition>> = Object.freeze(Object.fromEntries(DEFINITIONS.map((d) => [d.name, d])));

/** Own-property lookup only: "__proto__", "constructor", "toString" etc. are NOT tools. */
export function lookupTool(name: unknown): ToolDefinition | null {
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(REGISTRY, name)) return null;
  return REGISTRY[name];
}
export const listTools = (): ToolDefinition[] => DEFINITIONS.slice();
export const isExecutable = (d: ToolDefinition): boolean => d.risk !== "FORBIDDEN";
export { isoDate };
