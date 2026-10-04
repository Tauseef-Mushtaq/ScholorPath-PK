import type { AnswerStatus, QuestionStatus, StoryStatus, VerificationStatus } from "./constants";

export type MentorClaim = {
  id: string;
  userId: string;
  verificationStatus: VerificationStatus;
  scholarshipId: string | null;
  universityId: string | null;
  countryId: string | null;
  degreeLevel: string | null;
  field: string | null;
  awardYear: number | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type MentorPublicCard = {
  id: string;
  degreeLevel: string | null;
  field: string | null;
  awardYear: number | null;
  verifiedAt: string | null;
  countryName: string | null;
  universityName: string | null;
  scholarshipName: string | null;
  storyCount: number;
};

export type MentorStory = {
  id: string;
  mentorId: string;
  title: string;
  body: string;
  status: StoryStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MentorTimelineItem = {
  id: string;
  mentorId: string;
  title: string;
  dateOrPeriod: string | null;
  description: string | null;
  sortOrder: number;
};

export type MentorQuestion = {
  id: string;
  askerUserId: string;
  mentorId: string | null;
  title: string;
  body: string;
  status: QuestionStatus;
  createdAt: string;
};

export type MentorAnswer = {
  id: string;
  mentorId: string;
  questionId: string | null;
  question: string | null;
  answer: string;
  status: AnswerStatus;
  createdAt: string;
};

export type MentorFormState = {
  error?: string;
  success?: string;
};
