import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAnswerStatus, isQuestionStatus, isStoryStatus, isVerificationStatus } from "./constants";
import type {
  MentorAnswer,
  MentorClaim,
  MentorPublicCard,
  MentorQuestion,
  MentorStory,
  MentorTimelineItem,
} from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const one = (v: unknown): Row | null => {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as Row) ?? null;
  return typeof v === "object" ? (v as Row) : null;
};

/** PostgREST: table/view not in schema cache (migration not applied yet). */
function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

function logMentorQueryError(label: string, error: { code?: string } | null): void {
  // Expected before Module 17 migration is applied — do not spam the browser console.
  if (isMissingRelation(error)) return;
  console.error(label, error?.code ?? "unknown");
}


function mapClaim(r: Row): MentorClaim {
  const vs = String(r.verification_status ?? "pending");
  return {
    id: String(r.id),
    userId: String(r.user_id),
    verificationStatus: isVerificationStatus(vs) ? vs : "pending",
    scholarshipId: str(r.scholarship_id),
    universityId: str(r.university_id),
    countryId: str(r.country_id),
    degreeLevel: str(r.degree_level),
    field: str(r.field),
    awardYear: typeof r.award_year === "number" ? r.award_year : r.award_year != null ? Number(r.award_year) : null,
    verifiedAt: str(r.verified_at),
    createdAt: String(r.created_at ?? ""),
  };
}

function mapStory(r: Row): MentorStory {
  const st = String(r.status ?? "draft");
  return {
    id: String(r.id),
    mentorId: String(r.mentor_id),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    status: isStoryStatus(st) ? st : "draft",
    publishedAt: str(r.published_at),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function mapTimeline(r: Row): MentorTimelineItem {
  return {
    id: String(r.id),
    mentorId: String(r.mentor_id),
    title: String(r.title ?? ""),
    dateOrPeriod: str(r.date_or_period),
    description: str(r.description),
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order) || 0,
  };
}

function mapQuestion(r: Row): MentorQuestion {
  const st = String(r.status ?? "open");
  return {
    id: String(r.id),
    askerUserId: String(r.asker_user_id),
    mentorId: str(r.mentor_id),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    status: isQuestionStatus(st) ? st : "open",
    createdAt: String(r.created_at ?? ""),
  };
}

function mapAnswer(r: Row): MentorAnswer {
  const st = String(r.status ?? "published");
  return {
    id: String(r.id),
    mentorId: String(r.mentor_id),
    questionId: str(r.question_id),
    question: str(r.question),
    answer: String(r.answer ?? ""),
    status: isAnswerStatus(st) ? st : "published",
    createdAt: String(r.created_at ?? ""),
  };
}

/** Own mentor application (any status). */
export async function loadOwnMentorClaim(
  supabase: SupabaseClient,
  userId: string,
): Promise<MentorClaim | null | "error"> {
  const { data, error } = await supabase
    .from("mentors")
    .select(
      "id,user_id,verification_status,scholarship_id,university_id,country_id,degree_level,field,award_year,verified_at,created_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[mentors:own]", error.code ?? "unknown");
    return "error";
  }
  if (!data) return null;
  return mapClaim(data as Row);
}

/**
 * Public list of verified mentors (anon or user client).
 * Avoids nested embeds that require schema-cache relationships (PGRST200 when
 * mentor_stories is missing or FK hints are ambiguous). Related names are resolved
 * with separate simple selects.
 */
export async function loadVerifiedMentors(
  supabase: SupabaseClient,
  limit = 50,
): Promise<MentorPublicCard[] | null> {
  const { data, error } = await supabase
    .from("mentors")
    .select(
      "id,degree_level,field,award_year,verified_at,country_id,university_id,scholarship_id",
    )
    .eq("verification_status", "verified")
    .order("verified_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error("[mentors:list]", error.code ?? "unknown");
    return null;
  }
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const countryIds = [...new Set(rows.map((r) => str(r.country_id)).filter(Boolean))] as string[];
  const uniIds = [...new Set(rows.map((r) => str(r.university_id)).filter(Boolean))] as string[];
  const schIds = [...new Set(rows.map((r) => str(r.scholarship_id)).filter(Boolean))] as string[];
  const mentorIds = rows.map((r) => String(r.id));

  const [countriesRes, unisRes, schRes, storiesRes] = await Promise.all([
    countryIds.length
      ? supabase.from("countries").select("id,name").in("id", countryIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    uniIds.length
      ? supabase.from("universities").select("id,name").in("id", uniIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    schIds.length
      ? supabase.from("scholarships").select("id,name").in("id", schIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    // Optional: if mentor_stories migration is not applied yet, ignore the error.
    supabase
      .from("mentor_stories")
      .select("mentor_id,status")
      .in("mentor_id", mentorIds)
      .eq("status", "published"),
  ]);

  const countryName = new Map<string, string>();
  for (const c of (countriesRes.data ?? []) as Row[]) {
    if (c.id && c.name) countryName.set(String(c.id), String(c.name));
  }
  const uniName = new Map<string, string>();
  for (const u of (unisRes.data ?? []) as Row[]) {
    if (u.id && u.name) uniName.set(String(u.id), String(u.name));
  }
  const schName = new Map<string, string>();
  for (const s of (schRes.data ?? []) as Row[]) {
    if (s.id && s.name) schName.set(String(s.id), String(s.name));
  }
  const storyCount = new Map<string, number>();
  if (!storiesRes.error) {
    for (const s of (storiesRes.data ?? []) as Row[]) {
      const mid = String(s.mentor_id ?? "");
      if (!mid) continue;
      storyCount.set(mid, (storyCount.get(mid) ?? 0) + 1);
    }
  }

  return rows.map((r) => {
    const id = String(r.id);
    const cid = str(r.country_id);
    const uid = str(r.university_id);
    const sid = str(r.scholarship_id);
    return {
      id,
      degreeLevel: str(r.degree_level),
      field: str(r.field),
      awardYear: typeof r.award_year === "number" ? r.award_year : null,
      verifiedAt: str(r.verified_at),
      countryName: cid ? countryName.get(cid) ?? null : null,
      universityName: uid ? uniName.get(uid) ?? null : null,
      scholarshipName: sid ? schName.get(sid) ?? null : null,
      storyCount: storyCount.get(id) ?? 0,
    };
  });
}

export async function loadVerifiedMentorById(
  supabase: SupabaseClient,
  mentorId: string,
): Promise<MentorPublicCard | null | "error"> {
  const { data, error } = await supabase
    .from("mentors")
    .select(
      "id,degree_level,field,award_year,verified_at,verification_status,country_id,university_id,scholarship_id",
    )
    .eq("id", mentorId)
    .maybeSingle();
  if (error) {
    console.error("[mentors:byId]", error.code ?? "unknown");
    return "error";
  }
  if (!data) return null;
  const r = data as Row;
  if (String(r.verification_status) !== "verified") return null;

  const cid = str(r.country_id);
  const uid = str(r.university_id);
  const sid = str(r.scholarship_id);

  const [countryRes, uniRes, schRes, storiesRes] = await Promise.all([
    cid
      ? supabase.from("countries").select("name").eq("id", cid).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    uid
      ? supabase.from("universities").select("name").eq("id", uid).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sid
      ? supabase.from("scholarships").select("name").eq("id", sid).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("mentor_stories")
      .select("id")
      .eq("mentor_id", mentorId)
      .eq("status", "published"),
  ]);

  return {
    id: String(r.id),
    degreeLevel: str(r.degree_level),
    field: str(r.field),
    awardYear: typeof r.award_year === "number" ? r.award_year : null,
    verifiedAt: str(r.verified_at),
    countryName: countryRes.data ? str((countryRes.data as Row).name) : null,
    universityName: uniRes.data ? str((uniRes.data as Row).name) : null,
    scholarshipName: schRes.data ? str((schRes.data as Row).name) : null,
    storyCount: storiesRes.error ? 0 : (storiesRes.data ?? []).length,
  };
}

export async function loadPublishedStoriesForMentor(
  supabase: SupabaseClient,
  mentorId: string,
): Promise<MentorStory[] | null> {
  const { data, error } = await supabase
    .from("mentor_stories")
    .select("id,mentor_id,title,body,status,published_at,created_at,updated_at")
    .eq("mentor_id", mentorId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) {
    logMentorQueryError("[mentors:stories]", error);
    return [];
  }
  return (data ?? []).map((r) => mapStory(r as Row));
}

export async function loadOwnStories(
  supabase: SupabaseClient,
  mentorId: string,
): Promise<MentorStory[] | null> {
  const { data, error } = await supabase
    .from("mentor_stories")
    .select("id,mentor_id,title,body,status,published_at,created_at,updated_at")
    .eq("mentor_id", mentorId)
    .order("updated_at", { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => mapStory(r as Row));
}

export async function loadTimelineForMentor(
  supabase: SupabaseClient,
  mentorId: string,
): Promise<MentorTimelineItem[] | null> {
  const { data, error } = await supabase
    .from("mentor_timelines")
    .select("id,mentor_id,title,date_or_period,description,sort_order")
    .eq("mentor_id", mentorId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    logMentorQueryError("[mentors:timeline]", error);
    return [];
  }
  return (data ?? []).map((r) => mapTimeline(r as Row));
}

export async function loadOpenQuestions(
  supabase: SupabaseClient,
  limit = 40,
): Promise<MentorQuestion[] | null> {
  const { data, error } = await supabase
    .from("mentor_questions")
    .select("id,asker_user_id,mentor_id,title,body,status,created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logMentorQueryError("[mentors:questions]", error);
    return [];
  }
  return (data ?? []).map((r) => mapQuestion(r as Row));
}

export async function loadPublishedAnswersForMentor(
  supabase: SupabaseClient,
  mentorId: string,
): Promise<MentorAnswer[] | null> {
  const { data, error } = await supabase
    .from("mentor_answers")
    .select("id,mentor_id,question_id,question,answer,status,created_at")
    .eq("mentor_id", mentorId)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) {
    logMentorQueryError("[mentors:answers]", error);
    return [];
  }
  return (data ?? []).map((r) => mapAnswer(r as Row));
}

/** Admin: all mentor claims (pending first). */
export async function loadAllMentorClaims(
  supabase: SupabaseClient,
  limit = 100,
): Promise<MentorClaim[] | null> {
  const { data, error } = await supabase
    .from("mentors")
    .select(
      "id,user_id,verification_status,scholarship_id,university_id,country_id,degree_level,field,award_year,verified_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[mentors:admin-list]", error.code ?? "unknown");
    return null;
  }
  return (data ?? []).map((r) => mapClaim(r as Row));
}

export async function loadPublishedStoriesRecent(
  supabase: SupabaseClient,
  limit = 20,
): Promise<(MentorStory & { mentorField: string | null })[] | null> {
  // No nested embed: mentor_stories may be missing until migration is applied;
  // filter verified mentors in a second step to avoid PGRST200.
  const { data, error } = await supabase
    .from("mentor_stories")
    .select("id,mentor_id,title,body,status,published_at,created_at,updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit * 2);
  if (error) {
    // Table missing or RLS: treat as empty, not a hard failure for the page.
    logMentorQueryError("[mentors:stories-recent]", error);
    return [];
  }
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const mentorIds = [...new Set(rows.map((r) => String(r.mentor_id)))];
  const { data: mentorsData, error: mentorsError } = await supabase
    .from("mentors")
    .select("id,field,verification_status")
    .in("id", mentorIds)
    .eq("verification_status", "verified");
  if (mentorsError) {
    logMentorQueryError("[mentors:stories-recent-mentors]", mentorsError);
    return [];
  }
  const fieldById = new Map<string, string | null>();
  for (const m of (mentorsData ?? []) as Row[]) {
    fieldById.set(String(m.id), str(m.field));
  }

  const out: (MentorStory & { mentorField: string | null })[] = [];
  for (const r of rows) {
    const mid = String(r.mentor_id);
    if (!fieldById.has(mid)) continue;
    out.push({ ...mapStory(r), mentorField: fieldById.get(mid) ?? null });
    if (out.length >= limit) break;
  }
  return out;
}
