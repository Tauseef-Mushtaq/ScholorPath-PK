export const EDUCATION_LEVELS = [
  { value: "high_school", label: "Matric / O-Level" },
  { value: "intermediate", label: "Intermediate / A-Level" },
  { value: "bachelor", label: "Bachelor's" },
  { value: "master", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "other", label: "Other" },
] as const;

export const EXPERIENCE_TYPES = [
  { value: "work", label: "Work" },
  { value: "internship", label: "Internship" },
  { value: "research", label: "Research" },
  { value: "volunteering", label: "Volunteering" },
  { value: "leadership", label: "Leadership / extracurricular" },
  { value: "other", label: "Other" },
] as const;

export type ProfileRow = {
  id: string;
  full_name: string | null;
  nationality: string | null;
  city: string | null;
};

export type EducationRow = {
  id: string;
  level: string | null;
  degree_name: string | null;
  field: string | null;
  institution: string | null;
  cgpa: number | null;
  cgpa_scale: number | null;
  start_date: string | null;
  expected_graduation: string | null;
};

export type ExperienceRow = {
  id: string;
  experience_type: string | null;
  title: string | null;
  organization: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
};

/** State returned by every profile Server Action (used with useActionState). */
export type ProfileFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of the submitted (string) values so the form survives a failed submit. */
  values?: Record<string, string>;
};
