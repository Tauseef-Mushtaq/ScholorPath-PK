import type { EducationRow, ExperienceRow, ProfileRow } from "./types";

export type CompletionItem = { key: string; label: string; done: boolean; hint: string };

/**
 * Simple completion indicator derived only from existing profile / education / experience data.
 * No stored score and no schema change. Experience is encouraged but treated as optional because
 * not every applicant has any yet.
 */
export function computeCompletion(
  profile: ProfileRow,
  education: EducationRow[],
  experiences: ExperienceRow[],
) {
  const items: CompletionItem[] = [
    { key: "name", label: "Full name", done: !!profile.full_name, hint: "Add your full name as it appears on your passport." },
    { key: "nationality", label: "Nationality", done: !!profile.nationality, hint: "Many scholarships are limited by nationality." },
    { key: "city", label: "City", done: !!profile.city, hint: "Add the city you live in." },
    {
      key: "education",
      label: "At least one education record",
      done: education.length > 0,
      hint: "Add your education history to improve your scholarship matches.",
    },
    {
      key: "cgpa",
      label: "CGPA recorded for your latest degree",
      done: education.some((e) => e.cgpa !== null && e.cgpa_scale !== null),
      hint: "Minimum GPA is a common eligibility rule, so add a CGPA and its scale.",
    },
    {
      key: "experience",
      label: "Experience (optional)",
      done: experiences.length > 0,
      hint: "Work, research or volunteering helps with applications. Skip it if you have none yet.",
    },
  ];
  const required = items.filter((i) => i.key !== "experience");
  const doneRequired = required.filter((i) => i.done).length;
  return { items, percent: Math.round((doneRequired / required.length) * 100), complete: doneRequired === required.length };
}
