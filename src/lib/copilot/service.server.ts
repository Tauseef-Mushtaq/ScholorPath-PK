import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAiKeys } from "@/lib/env.server";
import { loadOwnProfileResult } from "@/lib/profile/queries";

import { resolveCopilotModel } from "./config";
import { GeminiCopilotProvider, type GenerationProvider } from "./generation";
import {
  SYSTEM_INSTRUCTION,
  buildUserContent,
  formatProfileForPrompt,
  formatScholarshipForPrompt,
} from "./prompt";
import type { GenerateDraftRequest, GenerateDraftResult } from "./types";
import {
  isUuid,
  parseDraftType,
  parseExtraInstructions,
  parseQuestion,
} from "./validation";

/**
 * Module 15 — generate a draft for an application the user owns.
 * Caller must already have authenticated the user; this uses the cookie-bound client for ownership.
 */

type ScholarshipSlice = {
  name: string;
  provider: string;
  degreeLevel: string;
  fundingType: string;
  countryName: string | null;
  field: string | null;
};

async function loadOwnedApplicationScholarship(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
): Promise<{ scholarship: ScholarshipSlice } | null> {
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id,user_id,scholarships!inner(name,provider,degree_level,funding_type,field,countries(name))",
    )
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const s = data.scholarships as unknown;
  const row = Array.isArray(s) ? s[0] : s;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const countries = r.countries;
  const c = Array.isArray(countries) ? countries[0] : countries;
  const countryName =
    c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string"
      ? (c as { name: string }).name
      : null;
  return {
    scholarship: {
      name: String(r.name ?? ""),
      provider: String(r.provider ?? ""),
      degreeLevel: String(r.degree_level ?? ""),
      fundingType: String(r.funding_type ?? ""),
      countryName,
      field: typeof r.field === "string" ? r.field : null,
    },
  };
}

export async function generateDraftForUser(args: {
  supabase: SupabaseClient;
  userId: string;
  body: unknown;
  generator?: GenerationProvider;
}): Promise<GenerateDraftResult> {
  const body = args.body as GenerateDraftRequest | null;
  if (!body || typeof body !== "object") {
    return { ok: false, code: "validation_error", message: "Invalid request." };
  }
  if (!isUuid(body.applicationId)) {
    return { ok: false, code: "validation_error", message: "Invalid application." };
  }
  const draftType = parseDraftType(body.draftType);
  if (!draftType) {
    return { ok: false, code: "validation_error", message: "Invalid draft type." };
  }
  const question = parseQuestion(body.question);
  if (question && typeof question === "object" && "error" in question) {
    return { ok: false, code: "validation_error", message: question.error };
  }
  const extra = parseExtraInstructions(body.extraInstructions);
  if (extra && typeof extra === "object" && "error" in extra) {
    return { ok: false, code: "validation_error", message: extra.error };
  }
  if (draftType === "application_question" && !question) {
    return { ok: false, code: "validation_error", message: "Question text is required for application answers." };
  }

  const owned = await loadOwnedApplicationScholarship(args.supabase, args.userId, body.applicationId);
  if (!owned) {
    return { ok: false, code: "not_found", message: "Application not found." };
  }

  const profileResult = await loadOwnProfileResult(args.supabase, args.userId);
  if (profileResult.status === "error") {
    return { ok: false, code: "generation_failed", message: "Could not load profile." };
  }
  if (profileResult.status === "missing") {
    return {
      ok: false,
      code: "profile_missing",
      message: "Complete your profile before generating a draft.",
    };
  }

  const profileText = formatProfileForPrompt(profileResult.data);
  const scholarshipText = formatScholarshipForPrompt(owned.scholarship);
  const existing =
    typeof body.existingContent === "string" && body.existingContent.trim()
      ? body.existingContent.slice(0, 50_000)
      : null;

  const userContent = buildUserContent({
    draftType,
    profileText,
    scholarshipText,
    question: typeof question === "string" ? question : null,
    extraInstructions: typeof extra === "string" ? extra : null,
    existingContent: existing,
  });

  const generator =
    args.generator ??
    new GeminiCopilotProvider(
      resolveCopilotModel(process.env.GEMINI_GENERATION_MODEL),
      getAiKeys().gemini,
      (url, init) => fetch(url, init),
    );

  const outcome = await generator.generate({ system: SYSTEM_INSTRUCTION, user: userContent });
  if (!outcome.ok) {
    return {
      ok: false,
      code: outcome.code,
      message:
        outcome.code === "generation_unavailable"
          ? "AI drafting is temporarily unavailable. You can still write manually."
          : "Draft generation failed. Please try again.",
    };
  }

  const warnings: string[] = [];
  if (!profileResult.data.education.length) {
    warnings.push("Your profile has no education entries — review the draft carefully.");
  }
  if (outcome.text.includes("[Student:")) {
    warnings.push("The draft contains placeholders for facts you still need to add.");
  }

  return {
    ok: true,
    content: outcome.text.slice(0, 50_000),
    draftType,
    warnings,
    usedProfile: true,
    usedScholarship: true,
  };
}
