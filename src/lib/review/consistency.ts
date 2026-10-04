/**
 * Consistency checker (Module 16 / FR-022). PURE — no I/O, no AI generation.
 * Heuristic comparisons of profile facts vs draft text. Never invents student achievements.
 * Flags need-verification items only; does not rewrite drafts.
 */

import type { ReviewDraftInput, ReviewItem, ReviewProfileInput } from "./types";

function item(
  id: string,
  severity: ReviewItem["severity"],
  title: string,
  detail: string,
): ReviewItem {
  return { id, category: "consistency", severity, title, detail };
}

/** Extract plausible CGPA-like numbers (e.g. 3.5, 3.75/4.0) from free text. */
export function extractGpaMentions(text: string): number[] {
  const out: number[] = [];
  const re = /\b([0-4](?:\.\d{1,2})?)\s*(?:\/\s*([0-9]+(?:\.\d+)?))?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    // Prefer values that look like GPA on a 4 or 5 scale
    if (n >= 1 && n <= 4.5) out.push(n);
  }
  return out;
}

function normalizeWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

function hasOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) {
    if (b.has(w)) return true;
  }
  return false;
}

export function checkConsistency(
  profile: ReviewProfileInput,
  drafts: ReviewDraftInput[],
): ReviewItem[] {
  const out: ReviewItem[] = [];
  if (!profile.hasProfile || drafts.length === 0) {
    if (drafts.length === 0) {
      out.push(
        item(
          "consistency-no-drafts",
          "info",
          "No drafts to compare",
          "Consistency checks run when SOP/CV/proposal drafts exist alongside your profile.",
        ),
      );
    }
    return out;
  }

  // GPA: draft mentions vs recorded profile CGPA
  if (profile.maxCgpa != null && Number.isFinite(profile.maxCgpa)) {
    const allMentions: number[] = [];
    for (const d of drafts) {
      if (d.content.trim().length < 20) continue;
      allMentions.push(...extractGpaMentions(d.content));
    }
    const mismatches = allMentions.filter((g) => Math.abs(g - profile.maxCgpa!) > 0.35);
    if (mismatches.length > 0) {
      out.push(
        item(
          "consistency-gpa",
          "warn",
          "Possible GPA mismatch in drafts",
          `Profile records CGPA ≈ ${profile.maxCgpa}${profile.maxCgpaScale ? ` / ${profile.maxCgpaScale}` : ""}, but draft text mentions other values (e.g. ${mismatches[0]}). Verify numbers before submitting.`,
        ),
      );
    } else if (allMentions.length > 0) {
      out.push(
        item(
          "consistency-gpa-ok",
          "ok",
          "GPA mentions align with profile",
          "Numbers found in drafts are close to your recorded CGPA.",
        ),
      );
    }
  } else {
    const anyGpa = drafts.some((d) => extractGpaMentions(d.content).length > 0);
    if (anyGpa) {
      out.push(
        item(
          "consistency-gpa-unrecorded",
          "warn",
          "Drafts mention GPA but profile has none",
          "Record CGPA on your education entries, or remove unverified GPA claims from drafts.",
        ),
      );
    }
  }

  // Field / degree keywords: if profile has field labels, core drafts should share some words
  const fieldWords = new Set<string>();
  for (const f of profile.fieldLabels) {
    for (const w of normalizeWords(f)) fieldWords.add(w);
  }
  for (const l of profile.educationLabels) {
    for (const w of normalizeWords(l)) fieldWords.add(w);
  }

  if (fieldWords.size > 0) {
    const core = drafts.filter((d) =>
      ["sop", "motivation_letter", "personal_statement", "research_proposal", "study_plan"].includes(d.draftType),
    );
    let anyOverlap = false;
    let checked = 0;
    for (const d of core) {
      if (d.content.trim().length < 80) continue;
      checked++;
      if (hasOverlap(fieldWords, normalizeWords(d.content))) anyOverlap = true;
    }
    if (checked > 0 && !anyOverlap) {
      out.push(
        item(
          "consistency-field",
          "warn",
          "Drafts may not mention your recorded field",
          "Your education field/degree words do not appear in core drafts. Confirm the narrative matches your profile.",
        ),
      );
    } else if (checked > 0 && anyOverlap) {
      out.push(
        item(
          "consistency-field-ok",
          "ok",
          "Field/degree language present in drafts",
          "Core drafts mention words related to your recorded education.",
        ),
      );
    }
  }

  // Experience: drafts claim years of experience while profile has zero experience rows
  if (profile.experienceCount === 0) {
    const expClaim = drafts.some((d) =>
      /\b(\d+\+?\s*(years?|yrs?)\s+(of\s+)?(experience|work|professional))\b/i.test(d.content),
    );
    if (expClaim) {
      out.push(
        item(
          "consistency-experience",
          "warn",
          "Drafts claim experience not on profile",
          "Text mentions years of experience but no experience records exist. Add experiences or remove unverified claims.",
        ),
      );
    }
  }

  if (out.length === 0) {
    out.push(
      item(
        "consistency-none",
        "ok",
        "No automatic consistency issues",
        "Heuristic checks found no contradictions. Always re-read drafts against official requirements.",
      ),
    );
  }

  return out;
}
