import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApplicationDetail } from "@/lib/applications/types";
import type { ApplicationDraft } from "@/lib/copilot/types";
import { loadOwnDocuments } from "@/lib/documents/queries";
import { evaluateScholarship } from "@/lib/matching/eligibility";
import { loadMatchProfile, toMatchScholarship } from "@/lib/matching/queries";
import { loadOwnProfile } from "@/lib/profile/queries";
import { createPublicClient } from "@/lib/supabase/public";

import { buildApplicationHealth } from "./health";
import type {
  ApplicationHealth,
  ReviewDocumentInput,
  ReviewDraftInput,
  ReviewEligibilityInput,
  ReviewInput,
  ReviewProfileInput,
  ReviewTaskInput,
} from "./types";

type Row = Record<string, unknown>;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toProfileInput(
  own: Awaited<ReturnType<typeof loadOwnProfile>>,
): ReviewProfileInput {
  if (!own) {
    return {
      hasProfile: false,
      fullNamePresent: false,
      nationalityPresent: false,
      educationCount: 0,
      experienceCount: 0,
      maxCgpa: null,
      maxCgpaScale: null,
      educationLabels: [],
      fieldLabels: [],
    };
  }
  let maxCgpa: number | null = null;
  let maxCgpaScale: number | null = null;
  const educationLabels: string[] = [];
  const fieldLabels: string[] = [];
  for (const e of own.education) {
    if (e.degree_name) educationLabels.push(e.degree_name);
    if (e.level) educationLabels.push(e.level);
    if (e.field) fieldLabels.push(e.field);
    if (e.institution) educationLabels.push(e.institution);
    if (e.cgpa != null && Number.isFinite(e.cgpa)) {
      if (maxCgpa == null || e.cgpa > maxCgpa) {
        maxCgpa = e.cgpa;
        maxCgpaScale = e.cgpa_scale;
      }
    }
  }
  return {
    hasProfile: true,
    fullNamePresent: Boolean(own.profile.full_name?.trim()),
    nationalityPresent: Boolean(own.profile.nationality?.trim()),
    educationCount: own.education.length,
    experienceCount: own.experiences.length,
    maxCgpa,
    maxCgpaScale,
    educationLabels,
    fieldLabels,
  };
}

async function loadEligibility(
  userClient: SupabaseClient,
  userId: string,
  scholarshipId: string,
  todayIso: string,
): Promise<ReviewEligibilityInput | null> {
  try {
    const profileResult = await loadMatchProfile(userClient, userId);
    if (!profileResult.ok) return null;

    const publicClient = createPublicClient();
    if (!publicClient) return null;

    const { data, error } = await publicClient
      .from("scholarships")
      .select(
        [
          "id,name,provider,status,degree_level,field,funding_type,deadline",
          "minimum_gpa,minimum_gpa_scale,english_requirement_summary,eligibility_summary",
          "countries(name,slug),universities(name)",
          "scholarship_requirements(id,requirement_type,title,description,required)",
        ].join(","),
      )
      .eq("id", scholarshipId)
      .maybeSingle();
    if (error || !data) return null;

    const scholarship = toMatchScholarship(data as unknown as Row);
    const result = evaluateScholarship(profileResult.data, scholarship, todayIso);
    return {
      decision: result.decision,
      checks: result.checks.map((c, i) => ({
        id: `${c.key}-${i}`,
        outcome: c.outcome,
        label: c.label,
      })),
    };
  } catch (e) {
    console.error("[review] eligibility load failed", e instanceof Error ? e.name : "unknown");
    return null;
  }
}

/**
 * Build application health for the signed-in student's own application.
 * Uses session-bound client for own data; public client only for active scholarship eligibility.
 */
export async function loadApplicationHealth(
  supabase: SupabaseClient,
  userId: string,
  detail: ApplicationDetail,
  drafts: ApplicationDraft[],
): Promise<ApplicationHealth> {
  const todayIso = todayIsoDate();

  const [ownProfile, documents] = await Promise.all([
    loadOwnProfile(supabase, userId),
    loadOwnDocuments(supabase, userId),
  ]);

  const profile = toProfileInput(ownProfile);
  const docs: ReviewDocumentInput[] = (documents ?? []).map((d) => ({
    documentType: d.document_type ?? null,
    fileName: d.file_name ?? "",
  }));
  const draftInputs: ReviewDraftInput[] = drafts.map((d) => ({
    draftType: d.draftType,
    content: d.content,
    userApproved: d.userApproved,
    version: d.version,
  }));
  const tasks: ReviewTaskInput[] = detail.tasks.map((t) => ({
    title: t.title,
    status: t.status,
    required: t.required,
    dueDate: t.dueDate,
  }));

  const eligibility = await loadEligibility(supabase, userId, detail.scholarship.id, todayIso);

  const input: ReviewInput = {
    todayIso,
    profile,
    documents: docs,
    drafts: draftInputs,
    tasks,
    scholarship: {
      name: detail.scholarship.name,
      deadline: detail.scholarship.deadline,
      degreeLevel: detail.scholarship.degreeLevel,
      field: null,
      status: detail.scholarship.status,
    },
    eligibility,
  };

  return buildApplicationHealth(input);
}
