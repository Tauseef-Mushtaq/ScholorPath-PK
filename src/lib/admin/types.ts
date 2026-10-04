import type { ReportReason, ReportStatus, ReportTargetType } from "./constants";

export type AdminStats = {
  scholarshipsActive: number;
  scholarshipsDraft: number;
  mentorsPending: number;
  mentorsVerified: number;
  reportsOpen: number;
  profilesTotal: number;
  knowledgeDocuments: number;
};

export type AdminProfileRow = {
  id: string;
  userId: string;
  role: string;
  fullName: string | null;
  nationality: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportRow = {
  id: string;
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string | null;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type AdminActionRow = {
  id: string;
  adminUserId: string | null;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SourceSummary = {
  id: string;
  scholarshipId: string;
  scholarshipName: string;
  url: string | null;
  verified: boolean;
  lastCheckedAt: string | null;
};

export type AdminFormState = {
  error?: string;
  success?: string;
};
