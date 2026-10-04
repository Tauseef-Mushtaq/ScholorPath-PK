"use server";

import { revalidatePath } from "next/cache";

import { requireRole, requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import type { MentorFormState } from "./types";
import {
  parseAdminVerification,
  parseAnswerInput,
  parseApplyInput,
  parseQuestionInput,
  parseStoryInput,
  parseTimelineInput,
  isUuid,
} from "./validation";

function unavailable(): MentorFormState {
  return { error: "Mentor features are temporarily unavailable." };
}

export async function applyToBeMentor(
  _prev: MentorFormState,
  formData: FormData,
): Promise<MentorFormState> {
  const { user } = await requireUser();
  if (!isSupabaseConfigured()) return unavailable();
  const parsed = parseApplyInput({
    degreeLevel: formData.get("degreeLevel"),
    field: formData.get("field"),
    awardYear: formData.get("awardYear"),
    scholarshipId: formData.get("scholarshipId"),
  });
  if (!parsed.ok) return { error: parsed.message };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("mentors")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { error: "You already have a mentor application." };

  const { error } = await supabase.from("mentors").insert({
    user_id: user.id,
    degree_level: parsed.degreeLevel,
    field: parsed.field,
    award_year: parsed.awardYear,
    scholarship_id: parsed.scholarshipId,
  });
  if (error) {
    console.error("[mentors:apply]", error.code ?? "unknown");
    return { error: "Could not submit application. Please try again." };
  }
  revalidatePath("/mentor/apply");
  revalidatePath("/mentor/dashboard");
  revalidatePath("/admin/mentors");
  return { success: "Application submitted. An admin will review your claim." };
}

export async function createStory(
  _prev: MentorFormState,
  formData: FormData,
): Promise<MentorFormState> {
  const { user } = await requireUser();
  if (!isSupabaseConfigured()) return unavailable();
  const parsed = parseStoryInput({
    title: formData.get("title"),
    body: formData.get("body"),
    status: formData.get("status"),
  });
  if (!parsed.ok) return { error: parsed.message };

  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("mentors")
    .select("id,verification_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!claim || claim.verification_status !== "verified") {
    return { error: "Only verified mentors can publish stories." };
  }

  const published_at = parsed.status === "published" ? new Date().toISOString() : null;
  const { error } = await supabase.from("mentor_stories").insert({
    mentor_id: claim.id,
    title: parsed.title,
    body: parsed.body,
    status: parsed.status,
    published_at,
  });
  if (error) {
    console.error("[mentors:story]", error.code ?? "unknown");
    return { error: "Could not save story." };
  }
  revalidatePath("/mentor/dashboard");
  revalidatePath("/mentors");
  revalidatePath(`/mentors/${claim.id}`);
  return { success: parsed.status === "published" ? "Story published." : "Draft saved." };
}

export async function addTimelineItem(
  _prev: MentorFormState,
  formData: FormData,
): Promise<MentorFormState> {
  const { user } = await requireUser();
  if (!isSupabaseConfigured()) return unavailable();
  const parsed = parseTimelineInput({
    title: formData.get("title"),
    dateOrPeriod: formData.get("dateOrPeriod"),
    description: formData.get("description"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.ok) return { error: parsed.message };

  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("mentors")
    .select("id,verification_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!claim || claim.verification_status !== "verified") {
    return { error: "Only verified mentors can add timeline entries." };
  }

  const { error } = await supabase.from("mentor_timelines").insert({
    mentor_id: claim.id,
    title: parsed.title,
    date_or_period: parsed.dateOrPeriod,
    description: parsed.description,
    sort_order: parsed.sortOrder,
  });
  if (error) {
    console.error("[mentors:timeline]", error.code ?? "unknown");
    return { error: "Could not add timeline entry." };
  }
  revalidatePath("/mentor/dashboard");
  revalidatePath(`/mentors/${claim.id}`);
  return { success: "Timeline entry added." };
}

export async function askMentorQuestion(
  _prev: MentorFormState,
  formData: FormData,
): Promise<MentorFormState> {
  const { user } = await requireUser();
  if (!isSupabaseConfigured()) return unavailable();
  const parsed = parseQuestionInput({
    title: formData.get("title"),
    body: formData.get("body"),
    mentorId: formData.get("mentorId"),
  });
  if (!parsed.ok) return { error: parsed.message };

  const supabase = await createClient();
  const { error } = await supabase.from("mentor_questions").insert({
    asker_user_id: user.id,
    mentor_id: parsed.mentorId,
    title: parsed.title,
    body: parsed.body,
    status: "open",
  });
  if (error) {
    console.error("[mentors:question]", error.code ?? "unknown");
    return { error: "Could not post question." };
  }
  revalidatePath("/mentors");
  if (parsed.mentorId) revalidatePath(`/mentors/${parsed.mentorId}`);
  revalidatePath("/mentor/dashboard");
  return { success: "Question posted. Mentors may answer from personal experience." };
}

export async function answerQuestion(
  _prev: MentorFormState,
  formData: FormData,
): Promise<MentorFormState> {
  const { user } = await requireUser();
  if (!isSupabaseConfigured()) return unavailable();
  const parsed = parseAnswerInput({
    answer: formData.get("answer"),
    questionId: formData.get("questionId"),
    question: formData.get("question"),
  });
  if (!parsed.ok) return { error: parsed.message };

  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("mentors")
    .select("id,verification_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!claim || claim.verification_status !== "verified") {
    return { error: "Only verified mentors can answer." };
  }

  const { error } = await supabase.from("mentor_answers").insert({
    mentor_id: claim.id,
    question_id: parsed.questionId,
    question: parsed.question,
    answer: parsed.answer,
    status: "published",
  });
  if (error) {
    console.error("[mentors:answer]", error.code ?? "unknown");
    return { error: "Could not publish answer." };
  }
  if (parsed.questionId) {
    await supabase.from("mentor_questions").update({ status: "answered" }).eq("id", parsed.questionId);
  }
  revalidatePath("/mentor/dashboard");
  revalidatePath("/mentors");
  revalidatePath(`/mentors/${claim.id}`);
  return { success: "Answer published (labeled as personal experience)." };
}

export async function adminSetMentorVerification(
  _prev: MentorFormState,
  formData: FormData,
): Promise<MentorFormState> {
  await requireRole(["admin"]);
  if (!isSupabaseConfigured()) return unavailable();
  const mentorId = formData.get("mentorId");
  if (!isUuid(mentorId)) return { error: "Invalid mentor id." };
  const status = parseAdminVerification(formData.get("status"));
  if (!status) return { error: "Invalid verification status." };

  const supabase = await createClient();
  const { data: claim, error: fetchErr } = await supabase
    .from("mentors")
    .select("id,user_id,verification_status")
    .eq("id", mentorId)
    .maybeSingle();
  if (fetchErr || !claim) {
    console.error("[mentors:admin-verify-fetch]", fetchErr?.code ?? "missing");
    return { error: "Could not find mentor application." };
  }

  const patch: Record<string, unknown> = {
    verification_status: status,
    verified_at: status === "verified" ? new Date().toISOString() : null,
  };
  const { error } = await supabase.from("mentors").update(patch).eq("id", mentorId);
  if (error) {
    console.error("[mentors:admin-verify]", error.code ?? "unknown");
    return { error: "Could not update verification status." };
  }

  // Notify the applicant when status changes to verified or rejected.
  if (status === "verified" || status === "rejected") {
    const title =
      status === "verified"
        ? "Your mentor application was accepted"
        : "Your mentor application was rejected";
    const body =
      status === "verified"
        ? "You can now publish stories and answer questions on the mentor dashboard."
        : "Contact support if you believe this decision is incorrect.";
    const link = status === "verified" ? "/mentor/dashboard" : "/mentor/apply";
    const { error: notifErr } = await supabase.rpc("create_notification", {
      p_user_id: claim.user_id,
      p_type: status === "verified" ? "mentor_verified" : "mentor_rejected",
      p_title: title,
      p_body: body,
      p_link: link,
      p_metadata: { mentor_id: mentorId, status },
    });
    if (notifErr) {
      console.error("[mentors:admin-verify-notify]", notifErr.code ?? "unknown");
    }
  }

  revalidatePath("/admin/mentors");
  revalidatePath("/mentors");
  revalidatePath(`/mentors/${mentorId}`);
  revalidatePath("/mentor/dashboard");
  revalidatePath("/mentor/apply");
  return { success: `Mentor marked as ${status}.` };
}

/** Student withdraws / drops their pending mentor application. Notifies all admins. */
export async function withdrawMentorApplication(
  _prev: MentorFormState,
  _formData: FormData,
): Promise<MentorFormState> {
  const { user } = await requireUser();
  if (!isSupabaseConfigured()) return unavailable();

  const supabase = await createClient();
  const { data: claim, error: fetchErr } = await supabase
    .from("mentors")
    .select("id,verification_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchErr) {
    console.error("[mentors:withdraw-fetch]", fetchErr.code ?? "unknown");
    return { error: "Could not load your application." };
  }
  if (!claim) return { error: "You do not have a mentor application." };
  if (claim.verification_status !== "pending") {
    return { error: "Only pending applications can be withdrawn." };
  }

  const { error } = await supabase.from("mentors").delete().eq("id", claim.id);
  if (error) {
    console.error("[mentors:withdraw]", error.code ?? "unknown");
    return { error: "Could not withdraw application. Please try again." };
  }

  // Notify admins that a student dropped their mentor application.
  // Use service-role client so we can list admin profiles (RLS blocks students).
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    const { data: admins } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("role", "admin");
    if (admins && admins.length > 0) {
      for (const admin of admins as { user_id: string }[]) {
        const { error: notifErr } = await adminClient.rpc("create_notification", {
          p_user_id: admin.user_id,
          p_type: "mentor_application_withdrawn",
          p_title: "Mentor application withdrawn",
          p_body: `A student withdrew their mentor application (user ${user.id.slice(0, 8)}…).`,
          p_link: "/admin/mentors",
          p_metadata: { mentor_id: claim.id, user_id: user.id },
        });
        if (notifErr) {
          console.error("[mentors:withdraw-notify]", notifErr.code ?? "unknown");
        }
      }
    }
  } catch (e) {
    console.error("[mentors:withdraw-notify-setup]", e);
  }

  revalidatePath("/mentor/apply");
  revalidatePath("/mentor/dashboard");
  revalidatePath("/admin/mentors");
  return { success: "Application withdrawn." };
}
