import type { ApplicationStatus, TaskStatus } from "./constants";

/** List row for `/applications` — never includes another user's id. */
export type ApplicationListItem = {
  id: string;
  status: ApplicationStatus;
  notes: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  resultDate: string | null;
  createdAt: string;
  updatedAt: string;
  scholarship: {
    id: string;
    name: string;
    provider: string;
    deadline: string | null;
    status: string;
    countryName: string | null;
  };
  taskCounts: { total: number; done: number; todo: number };
};

export type ApplicationTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  required: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationRoadmapStep = {
  id: string;
  position: number;
  title: string;
  description: string | null;
  targetDate: string | null;
};

export type ApplicationRoadmap = {
  id: string;
  title: string;
  summary: string | null;
  steps: ApplicationRoadmapStep[];
};

/** Detail for `/applications/[id]`. */
export type ApplicationDetail = {
  id: string;
  status: ApplicationStatus;
  notes: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  resultDate: string | null;
  createdAt: string;
  updatedAt: string;
  scholarship: {
    id: string;
    name: string;
    provider: string;
    deadline: string | null;
    status: string;
    degreeLevel: string;
    fundingType: string;
    officialApplicationUrl: string | null;
    officialInfoUrl: string | null;
    countryName: string | null;
  };
  tasks: ApplicationTask[];
  roadmap: ApplicationRoadmap | null;
};

export type ApplicationFormState = {
  error?: string;
  success?: string;
};
