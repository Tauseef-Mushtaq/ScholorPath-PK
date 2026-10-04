import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { evaluateScholarship } from "../matching/eligibility";
import { loadMatchProfile, toMatchScholarship } from "../matching/queries";
import { loadOwnDocuments } from "../documents/queries";
import { loadOwnProfileResult } from "../profile/queries";
import { chunkBelongsToScholarship, type RetrievalInput, type RetrievalOutcome } from "../knowledge/retrieve";
import { AGENT_CONFIG } from "./config";
import { runCatalogSearch, type CatalogDeps } from "./discovery";
import { toEligibilityData } from "./eligibility";
import { toAgentProfile } from "./profile";
import type { RoadmapData, RoadmapStepInput, ScholarshipData, TaskData, TaskStatus, ToolExecutors, ToolResult } from "./types";

/**
 * Tool adapters (SERVER-ONLY). Every adapter:
 *  - receives the user id from the authenticated session (ToolContext), never from tool input;
 *  - reads/writes through the USER's cookie-bound Supabase client, so RLS is the authority and the explicit user filters
 *    are belt-and-braces; the service-role key is never used here;
 *  - returns a deterministic `{ok:false, error}` instead of throwing or leaking database messages.
 * Retrieval reuses Module 11 `retrieve()` (no second vector search); chunks of any other scholarship are dropped.
 */
const COLUMNS = [
  "id,name,provider,status,degree_level,field,funding_type,deadline",
  "minimum_gpa,minimum_gpa_scale,english_requirement_summary,eligibility_summary",
  "countries!inner(name,slug),universities(name)",
  "scholarship_requirements(id,requirement_type,title,description,required)",
].join(",");

/** `catalog` = the EXISTING Module 08 search (`getScholarships`) and filter options (`getFilterOptions`); the agent has no query of its own. */
export type ExecutorDeps = { supabase: SupabaseClient; retrieve: (input: RetrievalInput) => Promise<RetrievalOutcome>; catalog: CatalogDeps };
const fail = <K extends string>(tool: K, error: "not_found" | "unavailable" | "failed" | "unauthorized" | "not_allowed_now" | "analysis_not_supported", existingId?: string) =>
  ({ ok: false as const, tool, error, ...(existingId ? { existingId } : {}) });

export function createExecutors({ supabase, retrieve, catalog }: ExecutorDeps): ToolExecutors {
  async function loadScholarship(id: string) {
    const { data, error } = await supabase.from("scholarships").select(COLUMNS).eq("id", id).maybeSingle();   // RLS: visible scholarships only
    if (error) return { kind: "error" as const };
    if (!data) return { kind: "none" as const };
    return { kind: "ok" as const, match: toMatchScholarship(data as unknown as Record<string, unknown>) };
  }
  const toData = (m: ReturnType<typeof toMatchScholarship>): ScholarshipData => ({
    id: m.id, name: m.name, provider: m.provider, degreeLevel: m.degreeLevel, field: m.field, fundingType: m.fundingType, deadline: m.deadline,
    country: m.country?.name ?? null, university: m.university?.name ?? null, minimumGpa: m.minimumGpa, minimumGpaScale: m.minimumGpaScale,
    englishRequirementSummary: m.englishRequirementSummary, eligibilitySummary: m.eligibilitySummary,
    requirements: m.requirements.map((r) => ({ id: r.id, type: r.requirementType, title: r.title, description: r.description, required: r.required })),
  });

  /** Finds (or creates, status 'planning') the student's own application row for a scholarship. RLS only allows active scholarships. */
  async function ensureApplication(userId: string, scholarshipId: string): Promise<string | null> {
    const found = await supabase.from("applications").select("id").eq("user_id", userId).eq("scholarship_id", scholarshipId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (found.error) return null;
    if (found.data) return String(found.data.id);
    const ins = await supabase.from("applications").insert({ user_id: userId, scholarship_id: scholarshipId, status: "planning" }).select("id").single();
    return ins.error || !ins.data ? null : String(ins.data.id);
  }
  const taskOf = (r: Record<string, unknown>): TaskData => ({ id: String(r.id), applicationId: String(r.application_id), title: String(r.title), status: String(r.status) as TaskStatus, dueDate: typeof r.due_date === "string" ? r.due_date : null, required: r.required !== false });
  const stepsOf = (rows: Record<string, unknown>[]): RoadmapStepInput[] => rows.sort((a, b) => Number(a.position) - Number(b.position)).map((r) => ({ title: String(r.title), description: typeof r.description === "string" ? r.description : null, targetDate: typeof r.target_date === "string" ? r.target_date : null }));
  async function writeSteps(roadmapId: string, steps: RoadmapStepInput[]): Promise<boolean> {
    const { error } = await supabase.from("application_roadmap_steps").insert(steps.map((s, i) => ({ roadmap_id: roadmapId, position: i + 1, title: s.title, description: s.description, target_date: s.targetDate })));
    return !error;
  }
  async function loadRoadmap(roadmapId: string): Promise<{ data: RoadmapData; applicationId: string } | null> {
    const r = await supabase.from("application_roadmaps").select("id,application_id,title,summary,applications!inner(scholarship_id)").eq("id", roadmapId).maybeSingle();
    if (r.error || !r.data) return null;
    const st = await supabase.from("application_roadmap_steps").select("position,title,description,target_date").eq("roadmap_id", roadmapId);
    if (st.error) return null;
    const app = Array.isArray(r.data.applications) ? r.data.applications[0] : r.data.applications;
    return { applicationId: String(r.data.application_id), data: { id: String(r.data.id), scholarshipId: String((app as Record<string, unknown>)?.scholarship_id ?? ""), title: String(r.data.title), summary: typeof r.data.summary === "string" ? r.data.summary : null, steps: stepsOf((st.data ?? []) as Record<string, unknown>[]) } };
  }

  return {
    // Criteria were validated by the policy layer; resolution against real countries/degrees/fields and the search itself are
    // delegated to the existing Module 08 functions (anon client + RLS: active scholarships only).
    async searchScholarships(input) {
      return runCatalogSearch(input, catalog);
    },
    async getScholarship({ scholarshipId }) {
      const r = await loadScholarship(scholarshipId);
      if (r.kind === "error") return fail("getScholarship", "unavailable");
      if (r.kind === "none") return fail("getScholarship", "not_found");
      return { ok: true, tool: "getScholarship", data: { scholarship: toData(r.match) } };
    },
    // Identity = ctx.userId (the session). The input is ignored on purpose: the model can never name a student.
    // Returns everything the schema stores for this student (profile, education, experiences); a missing profile row is
    // reported as such, a failed query as "unavailable" (never as an empty profile).
    async getStudentProfile(_input, ctx) {
      let r;
      try { r = await loadOwnProfileResult(supabase, ctx.userId); } catch { return fail("getStudentProfile", "unavailable"); }
      if (r.status === "error") return fail("getStudentProfile", "unavailable");
      return { ok: true, tool: "getStudentProfile", data: { profile: toAgentProfile(r.status === "ok" ? r.data : null) } };
    },
    async getStudentDocuments(_input, ctx) {
      const docs = await loadOwnDocuments(supabase, ctx.userId);
      if (!docs) return fail("getStudentDocuments", "unavailable");
      return { ok: true, tool: "getStudentDocuments", data: { documents: docs.map((d) => ({ id: d.id, documentType: d.document_type, fileName: d.file_name, mimeType: d.mime_type, createdAt: d.created_at })) } };
    },
    async checkEligibility({ scholarshipId }, ctx) {
      const [sc, pr] = await Promise.all([loadScholarship(scholarshipId), loadMatchProfile(supabase, ctx.userId)]);
      if (sc.kind === "error" || !pr.ok) return fail("checkEligibility", "unavailable");
      if (sc.kind === "none") return fail("checkEligibility", "not_found");
      return { ok: true, tool: "checkEligibility", data: { eligibility: toEligibilityData(evaluateScholarship(pr.data, sc.match, ctx.todayIso)) } };
    },
    async searchRag({ scholarshipId, query, limit }) {
      const sc = await loadScholarship(scholarshipId);   // authorization: RLS decides visibility before any retrieval
      if (sc.kind === "error") return fail("searchRag", "unavailable");
      if (sc.kind === "none") return fail("searchRag", "not_found");
      let r: RetrievalOutcome;
      try { r = await retrieve({ query, scholarshipId, limit }); } catch { return fail("searchRag", "failed"); }
      if (!r.ok) return fail("searchRag", r.code === "embedding_unavailable" ? "unavailable" : "failed");
      // Defence in depth: Module 11 already scopes; drop any residual cross-scholarship or null-id rows.
      const evidence = r.chunks.filter((c) => chunkBelongsToScholarship(c, scholarshipId)).slice(0, limit).map((c) => ({
        chunkId: c.chunkId, sourceId: c.source.id, sourceName: c.source.name, sourceUrl: c.source.url, sourceType: c.source.type, section: c.section,
        lastVerifiedAt: c.source.lastVerifiedAt, excerpt: c.content.slice(0, AGENT_CONFIG.rag.excerptChars), similarity: c.similarity,
      }));
      return { ok: true, tool: "searchRag", data: { evidence } };
    },
    async analyzeDocument({ documentId }, ctx) {
      const { data, error } = await supabase.from("documents").select("id").eq("id", documentId).eq("user_id", ctx.userId).maybeSingle();
      if (error) return fail("analyzeDocument", "unavailable");
      if (!data) return fail("analyzeDocument", "not_found");
      // Nothing processes document contents yet (no extraction pipeline). A structured failure, never invented analysis.
      return fail("analyzeDocument", "analysis_not_supported");
    },
    async createTask({ scholarshipId, title, description, dueDate, required }, ctx) {
      const sc = await loadScholarship(scholarshipId);
      if (sc.kind !== "ok") return fail("createTask", sc.kind === "none" ? "not_found" : "unavailable");
      const appId = await ensureApplication(ctx.userId, scholarshipId);
      if (!appId) return fail("createTask", "failed");
      const existing = await supabase.from("application_tasks").select("id,application_id,title,status,due_date,required").eq("application_id", appId).eq("title", title).limit(1).maybeSingle();
      if (existing.error) return fail("createTask", "failed");
      if (existing.data) return { ok: true, tool: "createTask", data: { task: taskOf(existing.data as Record<string, unknown>) } };   // idempotent
      const ins = await supabase.from("application_tasks").insert({ application_id: appId, title, description, due_date: dueDate, required, status: "todo" }).select("id,application_id,title,status,due_date,required").single();
      if (ins.error || !ins.data) return fail("createTask", "failed");
      return { ok: true, tool: "createTask", data: { task: taskOf(ins.data as Record<string, unknown>) } };
    },
    async updateTask({ taskId, status, title, description, dueDate }) {
      const patch: Record<string, unknown> = {};
      if (status) patch.status = status; if (title) patch.title = title; if (description) patch.description = description; if (dueDate) patch.due_date = dueDate;
      const { data, error } = await supabase.from("application_tasks").update(patch).eq("id", taskId).select("id,application_id,title,status,due_date,required").maybeSingle();   // RLS: own tasks only
      if (error) return fail("updateTask", "failed");
      if (!data) return fail("updateTask", "not_found");
      return { ok: true, tool: "updateTask", data: { task: taskOf(data as Record<string, unknown>) } };
    },
    async createRoadmap({ scholarshipId, title, summary, steps }, ctx): Promise<ToolResult<"createRoadmap">> {
      const sc = await loadScholarship(scholarshipId);
      if (sc.kind !== "ok") return fail("createRoadmap", sc.kind === "none" ? "not_found" : "unavailable");
      const appId = await ensureApplication(ctx.userId, scholarshipId);
      if (!appId) return fail("createRoadmap", "failed");
      const ex = await supabase.from("application_roadmaps").select("id").eq("application_id", appId).maybeSingle();
      if (ex.error) return fail("createRoadmap", "failed");
      if (ex.data) return fail("createRoadmap", "not_allowed_now", String(ex.data.id));   // changing it requires approval (updateRoadmap)
      const ins = await supabase.from("application_roadmaps").insert({ application_id: appId, title, summary }).select("id").single();
      if (ins.error || !ins.data) return fail("createRoadmap", "failed");
      if (!(await writeSteps(String(ins.data.id), steps))) { await supabase.from("application_roadmaps").delete().eq("id", ins.data.id); return fail("createRoadmap", "failed"); }
      return { ok: true, tool: "createRoadmap", data: { roadmap: { id: String(ins.data.id), scholarshipId, title, summary, steps } } };
    },
    async updateRoadmap({ roadmapId, title, summary, steps }) {
      const cur = await loadRoadmap(roadmapId);   // RLS: own roadmaps only
      if (!cur) return fail("updateRoadmap", "not_found");
      const patch: Record<string, unknown> = {};
      if (title) patch.title = title; if (summary) patch.summary = summary;
      if (Object.keys(patch).length) { const u = await supabase.from("application_roadmaps").update(patch).eq("id", roadmapId); if (u.error) return fail("updateRoadmap", "failed"); }
      if (steps) {
        // Not atomic (documented limitation): delete then insert; a failure after the delete leaves the roadmap without steps.
        const d = await supabase.from("application_roadmap_steps").delete().eq("roadmap_id", roadmapId); if (d.error) return fail("updateRoadmap", "failed");
        if (!(await writeSteps(roadmapId, steps))) return fail("updateRoadmap", "failed");
      }
      const next = await loadRoadmap(roadmapId);
      return next ? { ok: true, tool: "updateRoadmap", data: { roadmap: next.data } } : fail("updateRoadmap", "failed");
    },
  };
}
