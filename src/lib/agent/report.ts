import type { AgentState, FinalReport, MissingInfo, RequirementData, RoadmapStepInput } from "./types";
import { AGENT_CONFIG } from "./config";
import { documentCoverage, documentGaps, isDocumentRequirement, mapTitleToVaultType } from "./documents";

/** Everything here derives from validated state only. The model contributes at most `modelSummary` (display text). */

export function deadlineOpen(deadline: string | null, todayIso: string): "open" | "closed" | "unknown" {
  if (!deadline) return "unknown";
  return deadline < todayIso ? "closed" : "open";
}

/**
 * Gaps beyond eligibility: documents and documented requirements.
 * Document presence is decided from vault metadata only (document_type). Content is never assumed.
 * Non-document required rows stay as "Confirm you can meet" — they cannot be checked automatically.
 */
export function deriveGaps(s: AgentState): MissingInfo[] {
  const out: MissingInfo[] = [];
  if (!s.profile) out.push({ what: "Your profile could not be read", where: "profile" });
  if (s.documents === null) out.push({ what: "Your document list could not be read", where: "documents" });
  else if (s.documents.length === 0) out.push({ what: "No documents are in your vault yet", where: "documents" });

  const cov = documentCoverage(s.requirements, s.documents);
  out.push(...documentGaps(cov));

  // Non-document required rows (IELTS scores, nationality rules, etc.) — still "confirm yourself".
  for (const r of s.requirements) {
    if (!r.required) continue;
    if (isDocumentRequirement(r)) continue; // already handled via coverage
    out.push({ what: `Confirm you can meet: ${r.title}`, where: "scholarship_data" });
  }
  return out;
}

export type TaskCandidate = { title: string; description: string | null; dueDate: string | null; required: boolean };

/** Server-built task content (grounded in the scholarship record and missing items). The model cannot add requirements here. */
export function taskCandidates(s: AgentState, todayIso: string): TaskCandidate[] {
  const cap = AGENT_CONFIG.task;
  const out: TaskCandidate[] = [];
  const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

  for (const m of s.missing.filter((x) => x.where === "profile")) {
    out.push({ title: clip(`Update your profile: ${m.what}`, cap.titleMax), description: null, dueDate: null, required: true });
  }

  const cov = documentCoverage(s.requirements, s.documents);
  if (s.documents !== null && s.documents.length === 0 && cov.items.some((i) => i.required)) {
    out.push({
      title: "Upload your documents to the vault",
      description: "No documents are stored yet. Check the scholarship's document list on the official page.",
      dueDate: null,
      required: true,
    });
  }
  // Specific missing document categories (metadata match only).
  for (const item of cov.missing) {
    if (!item.required) continue;
    out.push({
      title: clip(`Upload: ${item.label}`, cap.titleMax),
      description: "This document is listed as required and was not found in your vault (matched by document type only; contents are not read).",
      dueDate: null,
      required: true,
    });
  }
  // Non-document requirements, and document requirements that could not be mapped to a vault category.
  for (const r of s.requirements) {
    if (isDocumentRequirement(r) && mapTitleToVaultType(r.title) !== null) continue; // covered above when missing
    out.push({
      title: clip(`Prepare: ${r.title}`, cap.titleMax),
      description: r.description ? clip(r.description, cap.descriptionMax) : null,
      dueDate: null,
      required: r.required,
    });
  }

  if (s.scholarship?.deadline && deadlineOpen(s.scholarship.deadline, todayIso) === "open") {
    out.push({
      title: "Finish and review your application before the deadline",
      description: `Deadline recorded for this scholarship: ${s.scholarship.deadline}. Confirm it on the official page.`,
      dueDate: s.scholarship.deadline,
      required: true,
    });
  }
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c.title.toLowerCase()) && seen.add(c.title.toLowerCase())).slice(0, cap.maxCreatedPerRun);
}

export function roadmapSteps(s: AgentState, todayIso: string): { title: string; summary: string | null; steps: RoadmapStepInput[] } {
  const rm = AGENT_CONFIG.roadmap;
  const steps: RoadmapStepInput[] = [];
  const profileGaps = s.missing.filter((m) => m.where === "profile");
  if (profileGaps.length) {
    steps.push({
      title: "Complete your profile",
      description: profileGaps.map((g) => g.what).join("; ").slice(0, rm.stepDescriptionMax),
      targetDate: null,
    });
  }

  const cov = documentCoverage(s.requirements, s.documents);
  const missingDocs = cov.missing.filter((i) => i.required);
  if (s.documents !== null && s.documents.length === 0 && cov.items.some((i) => i.required)) {
    steps.push({ title: "Gather and upload your documents", description: null, targetDate: null });
  } else if (missingDocs.length) {
    steps.push({
      title: "Upload missing documents",
      description: missingDocs.map((i) => i.label).join("; ").slice(0, rm.stepDescriptionMax),
      targetDate: null,
    });
  }

  // Required rows that are not satisfied by a present vault match (non-document, or unmapped, or still missing).
  const remaining: RequirementData[] = s.requirements.filter((r) => {
    if (!r.required) return false;
    if (!isDocumentRequirement(r)) return true;
    const mapped = mapTitleToVaultType(r.title);
    if (!mapped) return true; // unmapped → still prepare
    const item = cov.items.find((i) => i.vaultType === mapped);
    return !item || item.status !== "present";
  });
  if (remaining.length) {
    steps.push({
      title: "Prepare the documented requirements",
      description: remaining.map((r) => r.title).join("; ").slice(0, rm.stepDescriptionMax),
      targetDate: null,
    });
  }

  steps.push({ title: "Verify every requirement on the official page", description: null, targetDate: null });
  if (s.scholarship?.deadline && deadlineOpen(s.scholarship.deadline, todayIso) === "open") {
    steps.push({ title: "Finish your application", description: "Deadline recorded for this scholarship.", targetDate: s.scholarship.deadline });
  }
  const name = s.scholarship?.name ?? "scholarship";
  return { title: `Preparation roadmap: ${name}`.slice(0, rm.titleMax), summary: null, steps: steps.slice(0, rm.maxSteps) };
}

export function nextActionFor(s: AgentState, todayIso: string): string {
  if (s.termination === "selection_required") return "Several scholarships match. Open the one you want, then ask me to prepare you for it.";
  if (s.termination === "no_results") return "Nothing matches yet. Try fewer or different filters, or browse all scholarships.";
  if (s.termination === "invalid_criteria") return "Tell me at least a country, a degree level, a field of study, a funding type or a scholarship name.";
  if (s.discovery?.state === "selected" && s.goalKind === "discover_scholarships") {
    return "Open this scholarship to read its recorded requirements, then ask me to prepare you for it.";
  }
  if (s.termination === "awaiting_approval") return "Review the pending change and approve or decline it.";
  if (!s.scholarship) return "Open a scholarship page and ask again, or tell me which scholarship you mean.";
  if (deadlineOpen(s.scholarship.deadline, todayIso) === "closed") {
    return "The recorded deadline has passed. Confirm on the official page whether applications are still open.";
  }
  if (s.conflicts.length) return "Sources disagree on some points. Verify them on the official page before relying on them.";
  if (s.eligibility?.status === "not_eligible") {
    return "A documented requirement is not met. Check the official page before investing more time.";
  }
  const profile = s.missing.find((m) => m.where === "profile");
  if (profile) return `Complete this in your profile: ${profile.what}.`;
  const missingDoc = s.missing.find((m) => m.where === "documents" && /Missing document:/i.test(m.what));
  if (missingDoc) return `${missingDoc.what}. Upload it to your vault, then continue.`;
  if (s.createdTasks.length) return "Start with the first preparation task and confirm each requirement on the official page.";
  return "Confirm the requirements on the official page.";
}

export function buildReport(s: AgentState, modelSummary: string | null, todayIso: string): FinalReport {
  return {
    scholarship: s.scholarship ? { id: s.scholarship.id, name: s.scholarship.name } : null,
    eligibility: s.eligibility
      ? { status: s.eligibility.status, checks: s.eligibility.checks, limitations: s.eligibility.limitations }
      : null,
    discovery: s.discovery,
    missing: s.missing,
    conflicts: s.conflicts,
    evidence: s.retrievedEvidence,
    createdTasks: s.createdTasks,
    roadmap: s.roadmap,
    nextAction: nextActionFor(s, todayIso),
    modelSummary,
  };
}
