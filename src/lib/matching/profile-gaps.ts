/**
 * Which profile information matching actually uses, and what is missing (Module 09). PURE.
 * Only fields that the engine really evaluates are listed, so the student is never asked for data that has no effect.
 */

import { isLevelKey, gpaRatio, LEVEL_RANK } from "./normalize";
import { PROFILE_HREF, type MissingItem } from "./explain";
import type { MatchProfile } from "./types";

export type Readiness = "empty" | "partial" | "ready";

export type ProfileAssessment = {
  readiness: Readiness;
  gaps: (MissingItem & { why: string })[];
};

export function assessProfile(profile: MatchProfile): ProfileAssessment {
  const records = (Array.isArray(profile?.education) ? profile.education : []).filter((e) => e && isLevelKey(e.level));

  if (records.length === 0) {
    return {
      readiness: "empty",
      gaps: [
        {
          section: "education",
          what: "At least one education record with a level",
          why: "Your education level decides which scholarships are relevant to you. Without it we cannot compare you with any scholarship.",
          href: PROFILE_HREF.education,
        },
      ],
    };
  }

  const gaps: ProfileAssessment["gaps"] = [];
  const highest = Math.max(...records.map((e) => LEVEL_RANK[e.level as keyof typeof LEVEL_RANK]));
  const latest = records.filter((e) => LEVEL_RANK[e.level as keyof typeof LEVEL_RANK] === highest);

  if (!latest.some((e) => typeof e.field === "string" && e.field.trim())) {
    gaps.push({
      section: "education",
      what: "Field of study for your latest education",
      why: "Used to tell whether a scholarship is in your area. Without it, scholarships that name a field are marked 'to confirm'.",
      href: PROFILE_HREF.education,
    });
  }
  if (!records.some((e) => gpaRatio(e.cgpa, e.cgpaScale) !== null)) {
    gaps.push({
      section: "education",
      what: "CGPA and CGPA scale",
      why: "Many scholarships set a minimum GPA. Without it we cannot check that rule, so those scholarships stay 'possibly eligible' at best.",
      href: PROFILE_HREF.education,
    });
  }
  if (!latest.some((e) => typeof e.expectedGraduation === "string" && e.expectedGraduation)) {
    gaps.push({
      section: "education",
      what: "Graduation date (expected or actual) for your latest education",
      why: "Tells us whether the degree is completed or in progress, which some scholarships care about.",
      href: PROFILE_HREF.education,
    });
  }

  return { readiness: gaps.length ? "partial" : "ready", gaps };
}
