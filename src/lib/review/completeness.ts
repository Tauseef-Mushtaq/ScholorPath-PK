/**
 * Completeness checker (Module 16). PURE — no I/O, no AI.
 * Checks profile, documents (by type metadata), writing drafts, and tasks.
 */

import { CORE_WRITING_TYPES, EXPECTED_DOCUMENT_TYPES } from "./constants";
import type { ReviewDraftInput, ReviewDocumentInput, ReviewItem, ReviewProfileInput, ReviewTaskInput } from "./types";

function item(
  id: string,
  category: ReviewItem["category"],
  severity: ReviewItem["severity"],
  title: string,
  detail: string,
): ReviewItem {
  return { id, category, severity, title, detail };
}

export function checkProfileCompleteness(profile: ReviewProfileInput): ReviewItem[] {
  const out: ReviewItem[] = [];
  if (!profile.hasProfile) {
    out.push(
      item(
        "profile-missing",
        "profile",
        "blocker",
        "Profile not set up",
        "Create your student profile before applying. Eligibility and drafts depend on it.",
      ),
    );
    return out;
  }
  if (!profile.fullNamePresent) {
    out.push(
      item("profile-name", "profile", "warn", "Full name missing", "Add your full name on the profile page."),
    );
  }
  if (!profile.nationalityPresent) {
    out.push(
      item(
        "profile-nationality",
        "profile",
        "warn",
        "Nationality missing",
        "Many scholarships filter by nationality. Record it on your profile.",
      ),
    );
  }
  if (profile.educationCount === 0) {
    out.push(
      item(
        "profile-education",
        "profile",
        "blocker",
        "No education records",
        "Add at least one education entry (degree level, field, institution).",
      ),
    );
  } else {
    out.push(
      item(
        "profile-education-ok",
        "profile",
        "ok",
        "Education recorded",
        `${profile.educationCount} education record(s) on file.`,
      ),
    );
  }
  if (profile.experienceCount === 0) {
    out.push(
      item(
        "profile-experience",
        "profile",
        "info",
        "No experience records",
        "Optional for some programmes; useful for CV and SOP grounding.",
      ),
    );
  }
  return out;
}

export function checkDocumentCompleteness(documents: ReviewDocumentInput[]): ReviewItem[] {
  const types = new Set(
    documents.map((d) => (d.documentType ?? "").toLowerCase().trim()).filter(Boolean),
  );
  const out: ReviewItem[] = [];
  for (const expected of EXPECTED_DOCUMENT_TYPES) {
    if (types.has(expected.value)) {
      out.push(
        item(
          `doc-${expected.value}-ok`,
          "documents",
          "ok",
          `${expected.label} present`,
          "Found in your document vault (metadata).",
        ),
      );
    } else if (expected.required) {
      out.push(
        item(
          `doc-${expected.value}-missing`,
          "documents",
          "warn",
          `${expected.label} not found`,
          "Upload it in Document Vault if the programme requires it. This check uses document type only.",
        ),
      );
    } else {
      out.push(
        item(
          `doc-${expected.value}-optional`,
          "documents",
          "info",
          `${expected.label} not found`,
          "Optional for many programmes; add if required by the official call.",
        ),
      );
    }
  }
  if (documents.length === 0) {
    out.unshift(
      item(
        "doc-none",
        "documents",
        "warn",
        "Document vault empty",
        "Upload key files (passport, transcript, CV) before submitting externally.",
      ),
    );
  }
  return out;
}

export function checkWritingReadiness(drafts: ReviewDraftInput[]): ReviewItem[] {
  const out: ReviewItem[] = [];
  const byType = new Map<string, ReviewDraftInput[]>();
  for (const d of drafts) {
    const list = byType.get(d.draftType) ?? [];
    list.push(d);
    byType.set(d.draftType, list);
  }

  let hasCore = false;
  let hasApprovedCore = false;
  for (const t of CORE_WRITING_TYPES) {
    const list = byType.get(t) ?? [];
    if (list.length > 0) {
      hasCore = true;
      if (list.some((d) => d.userApproved && d.content.trim().length > 50)) {
        hasApprovedCore = true;
      }
    }
  }

  if (!hasCore) {
    out.push(
      item(
        "writing-none",
        "writing",
        "warn",
        "No core written drafts",
        "Create an SOP, motivation letter, personal statement, or research proposal in Application Copilot.",
      ),
    );
  } else if (!hasApprovedCore) {
    out.push(
      item(
        "writing-unapproved",
        "writing",
        "warn",
        "Core drafts not marked reviewed",
        "Open Application Copilot, review the text, and mark a draft as reviewed before using it externally.",
      ),
    );
  } else {
    out.push(
      item(
        "writing-ready",
        "writing",
        "ok",
        "Core writing reviewed",
        "At least one core draft is saved and marked reviewed.",
      ),
    );
  }

  const empty = drafts.filter((d) => d.content.trim().length < 20);
  if (empty.length > 0) {
    out.push(
      item(
        "writing-empty",
        "writing",
        "info",
        "Empty or very short drafts",
        `${empty.length} draft(s) have almost no content. Delete or revise them.`,
      ),
    );
  }

  const cv = byType.get("cv") ?? [];
  if (cv.length === 0) {
    out.push(
      item(
        "writing-cv-missing",
        "writing",
        "info",
        "No CV draft in workspace",
        "Optional: generate a CV summary in Copilot, or keep your vault CV file.",
      ),
    );
  }

  return out;
}

export function checkTaskCompleteness(tasks: ReviewTaskInput[], todayIso: string): ReviewItem[] {
  const out: ReviewItem[] = [];
  if (tasks.length === 0) {
    out.push(
      item(
        "tasks-none",
        "tasks",
        "info",
        "No preparation tasks",
        "Add tasks or run the scholarship preparation agent to build a checklist.",
      ),
    );
    return out;
  }

  const required = tasks.filter((t) => t.required);
  const requiredOpen = required.filter((t) => t.status !== "done" && t.status !== "skipped");
  const overdue = tasks.filter(
    (t) =>
      t.dueDate &&
      t.dueDate < todayIso &&
      t.status !== "done" &&
      t.status !== "skipped",
  );

  if (requiredOpen.length > 0) {
    out.push(
      item(
        "tasks-required-open",
        "tasks",
        "warn",
        "Required tasks incomplete",
        `${requiredOpen.length} required task(s) still open.`,
      ),
    );
  } else if (required.length > 0) {
    out.push(
      item(
        "tasks-required-ok",
        "tasks",
        "ok",
        "Required tasks done",
        "All required tasks are done or skipped.",
      ),
    );
  }

  if (overdue.length > 0) {
    out.push(
      item(
        "tasks-overdue",
        "tasks",
        "warn",
        "Overdue tasks",
        `${overdue.length} task(s) past their due date.`,
      ),
    );
  }

  const done = tasks.filter((t) => t.status === "done").length;
  out.push(
    item(
      "tasks-progress",
      "tasks",
      "info",
      "Task progress",
      `${done} of ${tasks.length} task(s) marked done.`,
    ),
  );

  return out;
}
