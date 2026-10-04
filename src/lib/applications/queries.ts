import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isApplicationStatus, isTaskStatus, type ApplicationStatus, type TaskStatus } from "./constants";
import type { ApplicationDetail, ApplicationListItem, ApplicationRoadmap, ApplicationTask } from "./types";

/**
 * Own-application reads through the USER's cookie-bound client. RLS limits rows to the caller;
 * explicit `user_id` filters are defence in depth. Never selects another user's id for the browser.
 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const one = (v: unknown): Row | null => {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as Row) ?? null;
  return typeof v === "object" ? (v as Row) : null;
};

function asAppStatus(v: unknown): ApplicationStatus {
  return isApplicationStatus(v) ? v : "planning";
}
function asTaskStatus(v: unknown): TaskStatus {
  return isTaskStatus(v) ? v : "todo";
}

function mapTask(r: Row): ApplicationTask {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    description: str(r.description),
    status: asTaskStatus(r.status),
    dueDate: str(r.due_date),
    required: r.required !== false,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function loadOwnApplications(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApplicationListItem[] | null> {
  const { data, error } = await supabase
    .from("applications")
    .select(
      [
        "id,status,notes,started_at,submitted_at,result_date,created_at,updated_at",
        "scholarships!inner(id,name,provider,deadline,status,countries(name))",
        "application_tasks(id,status)",
      ].join(","),
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[applications:list]", error.code ?? "unknown_error");
    return null;
  }
  return (data ?? []).map((row) => {
    const r = row as unknown as Row;
    const sch = one(r.scholarships);
    const country = sch ? one(sch.countries) : null;
    const tasks = Array.isArray(r.application_tasks) ? (r.application_tasks as Row[]) : [];
    const done = tasks.filter((t) => t.status === "done").length;
    const todo = tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length;
    return {
      id: String(r.id),
      status: asAppStatus(r.status),
      notes: str(r.notes),
      startedAt: str(r.started_at),
      submittedAt: str(r.submitted_at),
      resultDate: str(r.result_date),
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? ""),
      scholarship: {
        id: String(sch?.id ?? ""),
        name: String(sch?.name ?? "Scholarship"),
        provider: String(sch?.provider ?? ""),
        deadline: str(sch?.deadline),
        status: String(sch?.status ?? ""),
        countryName: country ? str(country.name) : null,
      },
      taskCounts: { total: tasks.length, done, todo },
    };
  });
}

export async function loadOwnApplication(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
): Promise<ApplicationDetail | null | "error"> {
  const { data, error } = await supabase
    .from("applications")
    .select(
      [
        "id,status,notes,started_at,submitted_at,result_date,created_at,updated_at",
        "scholarships!inner(id,name,provider,deadline,status,degree_level,funding_type,official_application_url,official_information_url,countries(name))",
        "application_tasks(id,title,description,status,due_date,required,created_at,updated_at)",
        "application_roadmaps(id,title,summary,application_roadmap_steps(id,position,title,description,target_date))",
      ].join(","),
    )
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[applications:detail]", error.code ?? "unknown_error");
    return "error";
  }
  if (!data) return null;

  const r = data as unknown as Row;
  const sch = one(r.scholarships);
  const country = sch ? one(sch.countries) : null;
  const tasksRaw = Array.isArray(r.application_tasks) ? (r.application_tasks as Row[]) : [];
  const tasks = tasksRaw
    .map(mapTask)
    .sort((a, b) => {
      if (a.status !== b.status) {
        const order = { todo: 0, in_progress: 1, done: 2, skipped: 3 } as Record<string, number>;
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      }
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });

  let roadmap: ApplicationRoadmap | null = null;
  const rmRaw = one(r.application_roadmaps);
  if (rmRaw) {
    const stepsRaw = Array.isArray(rmRaw.application_roadmap_steps)
      ? (rmRaw.application_roadmap_steps as Row[])
      : [];
    roadmap = {
      id: String(rmRaw.id),
      title: String(rmRaw.title ?? ""),
      summary: str(rmRaw.summary),
      steps: stepsRaw
        .map((s) => ({
          id: String(s.id),
          position: typeof s.position === "number" ? s.position : 0,
          title: String(s.title ?? ""),
          description: str(s.description),
          targetDate: str(s.target_date),
        }))
        .sort((a, b) => a.position - b.position),
    };
  }

  return {
    id: String(r.id),
    status: asAppStatus(r.status),
    notes: str(r.notes),
    startedAt: str(r.started_at),
    submittedAt: str(r.submitted_at),
    resultDate: str(r.result_date),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    scholarship: {
      id: String(sch?.id ?? ""),
      name: String(sch?.name ?? "Scholarship"),
      provider: String(sch?.provider ?? ""),
      deadline: str(sch?.deadline),
      status: String(sch?.status ?? ""),
      degreeLevel: String(sch?.degree_level ?? ""),
      fundingType: String(sch?.funding_type ?? ""),
      officialApplicationUrl: str(sch?.official_application_url),
      officialInfoUrl: str(sch?.official_information_url),
      countryName: country ? str(country.name) : null,
    },
    tasks,
    roadmap,
  };
}

/** Returns the caller's application id for a scholarship, if any (most recent). */
export async function findOwnApplicationId(
  supabase: SupabaseClient,
  userId: string,
  scholarshipId: string,
): Promise<string | null | "error"> {
  const { data, error } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .eq("scholarship_id", scholarshipId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[applications:find]", error.code ?? "unknown_error");
    return "error";
  }
  return data ? String(data.id) : null;
}
