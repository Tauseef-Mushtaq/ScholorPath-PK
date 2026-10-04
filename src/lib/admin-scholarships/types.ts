import type { ScholarshipStatus } from "./validation";

export type AdminFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** Set after a successful create so the client can navigate to the edit page. */
  redirectTo?: string;
};

export type AdminScholarshipRow = {
  id: string;
  name: string;
  provider: string;
  status: ScholarshipStatus;
  deadline: string | null;
  updatedAt: string;
  country: string | null;
  university: string | null;
};

export type AdminScholarshipFull = {
  id: string;
  status: ScholarshipStatus;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  values: Record<string, string>;
};

export type AdminSource = {
  id: string;
  sourceUrl: string;
  sourceName: string | null;
  sourceType: string | null;
  priority: number;
  active: boolean;
  lastVerifiedAt: string | null;
};

export type Option = { value: string; label: string };
