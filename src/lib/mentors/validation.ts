import {
  ANSWER_MAX,
  DEGREE_LEVEL_MAX,
  FIELD_MAX,
  isStoryStatus,
  isVerificationStatus,
  QUESTION_BODY_MAX,
  QUESTION_TITLE_MAX,
  STORY_BODY_MAX,
  STORY_TITLE_MAX,
  TIMELINE_DESC_MAX,
  TIMELINE_PERIOD_MAX,
  TIMELINE_TITLE_MAX,
  type StoryStatus,
  type VerificationStatus,
} from "./constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function clip(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

export function parseApplyInput(raw: {
  degreeLevel?: unknown;
  field?: unknown;
  awardYear?: unknown;
  scholarshipId?: unknown;
}): { ok: true; degreeLevel: string | null; field: string | null; awardYear: number | null; scholarshipId: string | null } | { ok: false; message: string } {
  const degreeLevel =
    typeof raw.degreeLevel === "string" && raw.degreeLevel.trim()
      ? clip(raw.degreeLevel, DEGREE_LEVEL_MAX)
      : null;
  const field =
    typeof raw.field === "string" && raw.field.trim() ? clip(raw.field, FIELD_MAX) : null;
  let awardYear: number | null = null;
  if (raw.awardYear !== undefined && raw.awardYear !== null && raw.awardYear !== "") {
    const n = typeof raw.awardYear === "number" ? raw.awardYear : Number(raw.awardYear);
    if (!Number.isInteger(n) || n < 1900 || n > 2100) {
      return { ok: false, message: "Award year must be between 1900 and 2100." };
    }
    awardYear = n;
  }
  const scholarshipId =
    typeof raw.scholarshipId === "string" && isUuid(raw.scholarshipId) ? raw.scholarshipId : null;
  return { ok: true, degreeLevel, field, awardYear, scholarshipId };
}

export function parseStoryInput(raw: {
  title?: unknown;
  body?: unknown;
  status?: unknown;
}): { ok: true; title: string; body: string; status: StoryStatus } | { ok: false; message: string } {
  const title = typeof raw.title === "string" ? clip(raw.title, STORY_TITLE_MAX) : "";
  const body = typeof raw.body === "string" ? raw.body.trim().slice(0, STORY_BODY_MAX) : "";
  if (title.length < 3) return { ok: false, message: "Title must be at least 3 characters." };
  if (body.length < 20) return { ok: false, message: "Story body must be at least 20 characters." };
  const status: StoryStatus = isStoryStatus(raw.status) ? raw.status : "draft";
  return { ok: true, title, body, status };
}

export function parseTimelineInput(raw: {
  title?: unknown;
  dateOrPeriod?: unknown;
  description?: unknown;
  sortOrder?: unknown;
}):
  | { ok: true; title: string; dateOrPeriod: string | null; description: string | null; sortOrder: number }
  | { ok: false; message: string } {
  const title = typeof raw.title === "string" ? clip(raw.title, TIMELINE_TITLE_MAX) : "";
  if (title.length < 2) return { ok: false, message: "Timeline title is required." };
  const dateOrPeriod =
    typeof raw.dateOrPeriod === "string" && raw.dateOrPeriod.trim()
      ? clip(raw.dateOrPeriod, TIMELINE_PERIOD_MAX)
      : null;
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim().slice(0, TIMELINE_DESC_MAX)
      : null;
  const sortOrder =
    typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder)
      ? Math.trunc(raw.sortOrder)
      : typeof raw.sortOrder === "string" && raw.sortOrder !== ""
        ? Math.trunc(Number(raw.sortOrder)) || 0
        : 0;
  return { ok: true, title, dateOrPeriod, description, sortOrder };
}

export function parseQuestionInput(raw: {
  title?: unknown;
  body?: unknown;
  mentorId?: unknown;
}):
  | { ok: true; title: string; body: string; mentorId: string | null }
  | { ok: false; message: string } {
  const title = typeof raw.title === "string" ? clip(raw.title, QUESTION_TITLE_MAX) : "";
  const body = typeof raw.body === "string" ? raw.body.trim().slice(0, QUESTION_BODY_MAX) : "";
  if (title.length < 5) return { ok: false, message: "Question title must be at least 5 characters." };
  if (body.length < 10) return { ok: false, message: "Question detail must be at least 10 characters." };
  const mentorId = typeof raw.mentorId === "string" && isUuid(raw.mentorId) ? raw.mentorId : null;
  return { ok: true, title, body, mentorId };
}

export function parseAnswerInput(raw: {
  answer?: unknown;
  questionId?: unknown;
  question?: unknown;
}):
  | { ok: true; answer: string; questionId: string | null; question: string | null }
  | { ok: false; message: string } {
  const answer = typeof raw.answer === "string" ? raw.answer.trim().slice(0, ANSWER_MAX) : "";
  if (answer.length < 10) return { ok: false, message: "Answer must be at least 10 characters." };
  const questionId = typeof raw.questionId === "string" && isUuid(raw.questionId) ? raw.questionId : null;
  const question =
    typeof raw.question === "string" && raw.question.trim()
      ? raw.question.trim().slice(0, 2000)
      : null;
  return { ok: true, answer, questionId, question };
}

export function parseAdminVerification(raw: unknown): VerificationStatus | null {
  return isVerificationStatus(raw) ? raw : null;
}
