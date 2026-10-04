
/** Autonomy levels (docs/AI_AGENT.md). The agent never exceeds L3 and never performs external actions. */
export type AutonomyLevel = "L0" | "L1" | "L2" | "L3";

export type RiskLevel = "READ_ONLY" | "LOW_RISK_MUTATION" | "APPROVAL_REQUIRED" | "FORBIDDEN";

export type ExecutableToolName =
  | "searchScholarships" | "getScholarship" | "getStudentProfile" | "getStudentDocuments" | "checkEligibility"
  | "searchRag" | "analyzeDocument" | "createTask" | "updateTask" | "createRoadmap" | "updateRoadmap";
/** Registered but FORBIDDEN: they exist so the policy layer can name and refuse them. They have no executor. */
export type ForbiddenToolName = "submitApplication" | "sendEmail" | "sendMessage" | "signDocument" | "acceptTerms" | "makePayment";
export type ToolName = ExecutableToolName | ForbiddenToolName;

// ---------------------------------------------------------------------------------------------------------------
// Scholarship discovery (Repair Session 4). The model only ever produces SearchCriteria (data); the server validates it,
// resolves it against the real database vocabulary and hands it to the existing Module 08 search.
// ---------------------------------------------------------------------------------------------------------------
export type FundingKind = "fully_funded" | "partially_funded" | "not_funded";
/** Validated, model-independent search criteria. Every field is optional (null) except openOnly. */
export type SearchCriteria = {
  query: string | null;
  country: string | null;
  degree: string | null;
  field: string | null;
  funding: FundingKind | null;
  deadlineDays: 30 | 90 | 180 | null;
  openOnly: boolean;
};
/** What was ACTUALLY applied to the database search (shown to the student; never contains anything the model invented). */
export type AppliedCriteria = {
  keywords: string[];
  country: string | null;
  degree: string[];
  field: { value: string; mode: "exact" | "keywords" } | null;
  funding: FundingKind | null;
  deadlineDays: number | null;
  openOnly: boolean;
};
/** A real database row (public, active scholarships only). */
export type Candidate = {
  id: string; name: string; provider: string; degreeLevel: string; field: string | null; fundingType: string;
  deadline: string | null; country: string | null; university: string | null;
};
export type UnresolvedCriterion = { criterion: "country" | "degree"; requested: string };
export type SearchData = {
  items: Candidate[];
  /** Total number of matching rows in the database (can exceed items.length). */
  total: number;
  applied: AppliedCriteria;
  /** Requested criteria that do not exist in the database (e.g. a country that is not recorded). */
  unresolved: UnresolvedCriterion[];
  /** Terms that could not be applied because of search limits. When non-empty nothing is auto-selected. */
  dropped: string[];
};
export type DiscoveryState = "selected" | "selection_required" | "no_results" | "invalid_criteria";
export type DiscoveryResult = {
  state: DiscoveryState;
  criteria: AppliedCriteria | null;
  candidates: Candidate[];
  total: number;
  /** Set ONLY when exactly one scholarship matches. */
  selectedId: string | null;
  unresolved: UnresolvedCriterion[];
  /** Built by the SERVER from the applied criteria and the real result counts. */
  explanation: string;
};

// ---------------------------------------------------------------------------------------------------------------
// Tool inputs (validated by the registry; the model's raw JSON is never passed to an executor)
// ---------------------------------------------------------------------------------------------------------------
export type RoadmapStepInput = { title: string; description: string | null; targetDate: string | null };
export type ToolInputs = {
  searchScholarships: SearchCriteria & { limit: number };
  getScholarship: { scholarshipId: string };
  getStudentProfile: Record<string, never>;
  getStudentDocuments: Record<string, never>;
  checkEligibility: { scholarshipId: string };
  searchRag: { scholarshipId: string; query: string; limit: number };
  analyzeDocument: { documentId: string };
  createTask: { scholarshipId: string; title: string; description: string | null; dueDate: string | null; required: boolean };
  updateTask: { taskId: string; status: TaskStatus | null; title: string | null; description: string | null; dueDate: string | null };
  createRoadmap: { scholarshipId: string; title: string; summary: string | null; steps: RoadmapStepInput[] };
  updateRoadmap: { roadmapId: string; title: string | null; summary: string | null; steps: RoadmapStepInput[] | null };
};
export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";

// ---------------------------------------------------------------------------------------------------------------
// Tool outputs
// ---------------------------------------------------------------------------------------------------------------
export type RequirementData = { id: string; type: string; title: string; description: string | null; required: boolean };
export type ScholarshipData = {
  id: string; name: string; provider: string; degreeLevel: string; field: string | null; fundingType: string; deadline: string | null;
  country: string | null; university: string | null; minimumGpa: number | null; minimumGpaScale: number | null;
  englishRequirementSummary: string | null; eligibilitySummary: string | null; requirements: RequirementData[];
};
export type EligibilityLabel = "eligible" | "not_eligible" | "unknown" | "needs_information";
export type EligibilityCheckData = { key: string; label: string; outcome: "met" | "not_met" | "unknown" | "not_applicable" | "info"; detail: string };
export type MissingInfo = { what: string; where: "profile" | "documents" | "scholarship_data" };
export type EligibilityData = {
  scholarshipId: string; status: EligibilityLabel; checks: EligibilityCheckData[]; missing: MissingInfo[];
  /** Always states what was NOT evaluated (e.g. nationality, free-text summaries). */
  limitations: string[];
};
export type EvidenceItem = {
  chunkId: string; sourceId: string; sourceName: string | null; sourceUrl: string; sourceType: string | null; section: string | null;
  lastVerifiedAt: string | null; excerpt: string; similarity: number;
};
/**
 * The signed-in student's STORED profile as the agent sees it (Repair Session 5). Built only from the columns that exist
 * in `profiles`, `education` and `experiences`; nothing is inferred or invented. No ids, no user id, no date of birth
 * (not collected, ADR "Module 03"), no role. `null` always means "not recorded".
 */
export type AgentEducation = {
  level: string | null; degreeName: string | null; field: string | null; institution: string | null;
  cgpa: number | null; cgpaScale: number | null; startDate: string | null; expectedGraduation: string | null;
};
export type AgentExperience = {
  type: string | null; title: string | null; organization: string | null; description: string | null; startDate: string | null; endDate: string | null;
};
export type AgentProfile = {
  /** false = the query worked but this student has no profile row at all. */
  recordExists: boolean;
  personal: { fullName: string | null; nationality: string | null; city: string | null };
  /** Most recent start date first (as stored). Capped; see `omitted`. */
  education: AgentEducation[];
  experiences: AgentExperience[];
  /** Records beyond the cap or unreadable (malformed) that were left out, so the agent never presents a partial list as complete. */
  omitted: { education: number; experiences: number };
  /** Facts the stored profile does not contain (server-derived, plain wording). */
  missing: string[];
};

export type DocumentMeta = { id: string; documentType: string | null; fileName: string; mimeType: string; createdAt: string };
export type TaskData = { id: string; applicationId: string; title: string; status: TaskStatus; dueDate: string | null; required: boolean };
export type RoadmapData = { id: string; scholarshipId: string; title: string; summary: string | null; steps: RoadmapStepInput[] };

export type ToolOutputs = {
  searchScholarships: SearchData;
  getScholarship: { scholarship: ScholarshipData };
  getStudentProfile: { profile: AgentProfile };
  getStudentDocuments: { documents: DocumentMeta[] };
  checkEligibility: { eligibility: EligibilityData };
  searchRag: { evidence: EvidenceItem[] };
  analyzeDocument: { documentId: string; analyzed: false; reason: "analysis_not_supported" };
  createTask: { task: TaskData };
  updateTask: { task: TaskData };
  createRoadmap: { roadmap: RoadmapData };
  updateRoadmap: { roadmap: RoadmapData };
};

export type ToolErrorCode =
  | "unknown_tool" | "invalid_input" | "forbidden_tool" | "unauthorized" | "not_found" | "unavailable"
  | "approval_required" | "not_allowed_now" | "limit_reached" | "failed" | "invalid_output" | "analysis_not_supported";

export type ToolResult<K extends ExecutableToolName = ExecutableToolName> =
  | { ok: true; tool: K; data: ToolOutputs[K] }
  | { ok: false; tool: K | string; error: ToolErrorCode; /** createRoadmap only: the roadmap that already exists. */ existingId?: string };

/** Identity comes ONLY from the authenticated server session. It is never part of any tool input. */
export type ToolContext = { userId: string; todayIso: string };

export type ToolExecutors = { [K in ExecutableToolName]: (input: ToolInputs[K], ctx: ToolContext) => Promise<ToolResult<K>> };

// ---------------------------------------------------------------------------------------------------------------
// Plan / state
// ---------------------------------------------------------------------------------------------------------------
export type PlanStepId =
  | "identify_scholarship" | "retrieve_requirements" | "inspect_profile" | "inspect_documents" | "check_eligibility"
  | "search_verified_knowledge" | "identify_gaps" | "create_tasks" | "build_roadmap" | "summarize"
  | "interpret_request" | "search_catalog";
export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";
export type PlanStep = { id: PlanStepId; label: string; status: StepStatus };

export type GoalKind = "prepare_scholarship" | "discover_scholarships" | "ambiguous" | "unsupported";
export type TerminationReason =
  | "completed" | "awaiting_approval" | "goal_unsupported" | "scholarship_not_identified" | "scholarship_not_found"
  | "max_iterations" | "max_tool_calls" | "max_model_calls" | "max_execution_time" | "max_evidence" | "too_many_rejected_proposals"
  | "model_unavailable" | "model_invalid_output" | "tool_failure" | "invalid_request"
  | "selection_required" | "no_results" | "invalid_criteria";

export type ToolCallRecord = { index: number; tool: string; status: "executed" | "rejected" | "awaiting_approval" | "failed"; error: ToolErrorCode | null; summary: string };
export type ApprovalRequest = { id: string; tool: ExecutableToolName; risk: RiskLevel; summary: string; token: string; expiresAt: string };
export type RoadmapChange = { kind: "created" | "updated"; roadmapId: string; title: string };
export type Conflict = { topic: string; code: "CONFLICTING_INFORMATION"; evidence: { sourceId: string; sourceName: string | null; sourceUrl: string; excerpt: string }[] };
export type AgentError = { code: ToolErrorCode | "model_invalid_output" | "model_unavailable"; step: PlanStepId | null; tool: string | null };

export type AgentState = {
  userId: string;
  goal: string;
  goalKind: GoalKind;
  autonomy: AutonomyLevel;
  scholarshipId: string | null;
  /** Result of a scholarship search (discovery goal, or identification by description). Rows come only from the database. */
  discovery: DiscoveryResult | null;
  plan: PlanStep[];
  currentStep: PlanStepId | null;
  completedSteps: PlanStepId[];
  pendingSteps: PlanStepId[];
  toolCalls: ToolCallRecord[];
  scholarship: ScholarshipData | null;
  profile: AgentProfile | null;
  documents: DocumentMeta[] | null;
  retrievedEvidence: EvidenceItem[];
  requirements: RequirementData[];
  eligibility: EligibilityData | null;
  missing: MissingInfo[];
  createdTasks: TaskData[];
  roadmapChanges: RoadmapChange[];
  roadmap: RoadmapData | null;
  approvalRequests: ApprovalRequest[];
  conflicts: Conflict[];
  errors: AgentError[];
  counters: { iterations: number; toolCalls: number; modelCalls: number; rejectedProposals: number; evidenceChars: number };
  finalResponse: FinalReport | null;
  termination: TerminationReason | null;
};

export type FinalReport = {
  scholarship: { id: string; name: string } | null;
  eligibility: { status: EligibilityLabel; checks: EligibilityCheckData[]; limitations: string[] } | null;
  missing: MissingInfo[];
  conflicts: Conflict[];
  evidence: EvidenceItem[];
  createdTasks: TaskData[];
  roadmap: RoadmapData | null;
  discovery: DiscoveryResult | null;
  /** Assembled by the SERVER from state only. */
  nextAction: string;
  /** Optional wording from the model, length-limited and never used as a fact source. */
  modelSummary: string | null;
};
