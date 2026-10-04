import type { DraftType } from "./constants";

export type ApplicationDraft = {
  id: string;
  applicationId: string;
  draftType: DraftType;
  title: string | null;
  content: string;
  version: number;
  aiGenerated: boolean;
  userApproved: boolean;
  promptSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DraftFormState = {
  error?: string;
  success?: string;
  draftId?: string;
};

/** Request body for POST /api/copilot/draft (client → server). */
export type GenerateDraftRequest = {
  applicationId: string;
  draftType: DraftType;
  /** For application_question: the question text from the form/provider. */
  question?: string;
  /** Optional student guidance (e.g. "emphasise research experience"). */
  extraInstructions?: string;
  /** Optional existing draft to revise. */
  existingContent?: string;
};

export type GenerateDraftResult =
  | {
      ok: true;
      content: string;
      draftType: DraftType;
      warnings: string[];
      usedProfile: boolean;
      usedScholarship: boolean;
    }
  | {
      ok: false;
      code:
        | "unauthorized"
        | "not_found"
        | "validation_error"
        | "generation_unavailable"
        | "generation_failed"
        | "profile_missing";
      message: string;
    };
