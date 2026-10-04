import { AGENT_CONFIG } from "./config";
import type { AgentEducation, AgentExperience, AgentProfile } from "./types";

/**
 * Student profile for the agent (Repair Session 5). PURE: no I/O, no Supabase.
 * `toAgentProfile` is the ONLY place where stored rows become what the agent sees. It
 *  - reads only columns that exist (profiles.full_name/nationality/city; education.*; experiences.*),
 *  - treats every value as untrusted/malformed-capable (wrong types, NaN, bad dates, huge text, non-array lists, null rows),
 *  - never invents: an unusable value becomes `null` ("not recorded"), an unusable row is counted in `omitted`,
 *  - copies no ids (row id, profile id, user id) and no role / date of birth.
 */
const CFG = AGENT_CONFIG.profile;
const CTRL = /[\u0000-\u001F\u007F]/g;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(CTRL, " ").replace(/\s+/g, " ").trim();   // single line: stored text cannot fake a new "line" in a prompt
  if (!t) return null;
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;
}

function education(r: unknown): AgentEducation | null {
  if (!isObj(r)) return null;
  const cgpa = num(r.cgpa); let scale = num(r.cgpa_scale);
  if (scale !== null && scale <= 0) scale = null;
  const contradicts = cgpa !== null && scale !== null && cgpa > scale;   // contradicts the DB constraint: keep neither rather than guess which is right
  const e: AgentEducation = {
    level: text(r.level, 40), degreeName: text(r.degree_name, CFG.shortTextMax), field: text(r.field, CFG.shortTextMax), institution: text(r.institution, CFG.shortTextMax),
    cgpa: contradicts ? null : cgpa, cgpaScale: contradicts ? null : scale, startDate: isoDate(r.start_date), expectedGraduation: isoDate(r.expected_graduation),
  };
  return Object.values(e).some((v) => v !== null) ? e : null;   // a row with nothing usable says nothing
}
function experience(r: unknown): AgentExperience | null {
  if (!isObj(r)) return null;
  const e: AgentExperience = {
    type: text(r.experience_type, 40), title: text(r.title, CFG.shortTextMax), organization: text(r.organization, CFG.shortTextMax),
    description: text(r.description, CFG.descriptionMax), startDate: isoDate(r.start_date), endDate: isoDate(r.end_date),
  };
  return Object.values(e).some((v) => v !== null) ? e : null;
}
function list<T>(raw: unknown, map: (r: unknown) => T | null, cap: number): { items: T[]; omitted: number } {
  if (!Array.isArray(raw)) return { items: [], omitted: 0 };
  const all = raw.map(map);
  const usable = all.filter((x): x is T => x !== null);
  return { items: usable.slice(0, cap), omitted: raw.length - Math.min(usable.length, cap) };
}

/** What the stored profile does not contain (only things the schema can hold). */
export function profileMissing(p: Omit<AgentProfile, "missing">): string[] {
  if (!p.recordExists) return ["No profile record exists for this student"];
  const m: string[] = [];
  if (!p.personal.fullName) m.push("Full name");
  if (!p.personal.nationality) m.push("Nationality");
  if (!p.personal.city) m.push("City");
  if (p.education.length === 0) {
    m.push(p.omitted.education ? "Education (stored records could not be read)" : "Education history (no education record)");
  } else {
    const any = (f: (e: AgentEducation) => unknown) => p.education.some((e) => f(e) !== null);
    if (!any((e) => e.level)) m.push("Education level");
    if (!any((e) => e.degreeName)) m.push("Degree name");
    if (!any((e) => e.field)) m.push("Field of study");
    if (!any((e) => e.institution)) m.push("Institution");
    if (!p.education.some((e) => e.cgpa !== null && e.cgpaScale !== null)) m.push(any((e) => e.cgpa) ? "CGPA scale" : "CGPA and CGPA scale");
    if (!any((e) => e.expectedGraduation)) m.push("Graduation date (expected or actual)");
  }
  if (p.experiences.length === 0) m.push(p.omitted.experiences ? "Experience (stored records could not be read)" : "Experience (none recorded)");
  return m;
}

/** Accepts the shape returned by `loadOwnProfileResult` (`{profile, education, experiences}`) or `null` for "no profile row". Never throws. */
export function toAgentProfile(own: unknown): AgentProfile {
  if (!isObj(own) || !isObj(own.profile)) {
    const base = { recordExists: false, personal: { fullName: null, nationality: null, city: null }, education: [], experiences: [], omitted: { education: 0, experiences: 0 } };
    return { ...base, missing: profileMissing(base) };
  }
  const edu = list(own.education, education, CFG.maxEducation);
  const exp = list(own.experiences, experience, CFG.maxExperiences);
  const base = {
    recordExists: true,
    personal: { fullName: text(own.profile.full_name, CFG.shortTextMax), nationality: text(own.profile.nationality, 100), city: text(own.profile.city, 100) },
    education: edu.items, experiences: exp.items, omitted: { education: edu.omitted, experiences: exp.omitted },
  };
  return { ...base, missing: profileMissing(base) };
}

/** Output contract used by the orchestrator before a tool result enters state. */
export function isAgentProfile(v: unknown): v is AgentProfile {
  return isObj(v) && typeof v.recordExists === "boolean" && isObj(v.personal) && Array.isArray(v.education) && Array.isArray(v.experiences)
    && isObj(v.omitted) && Array.isArray(v.missing) && v.missing.every((x) => typeof x === "string")
    && v.education.length <= CFG.maxEducation && v.experiences.length <= CFG.maxExperiences;
}

const v = (x: string | number | null, none = "not recorded") => (x === null ? none : String(x));
/**
 * Fact sheet for the model's digest and for internal planning questions ("what degree? what field? what CGPA? what experience?
 * what is missing?"). Every line is a stored value or an explicit "not recorded". The full name is NOT included (not needed
 * for planning; only whether it exists). Bounded by `digestChars`; a cut is announced, never silent.
 */
export function profileDigest(p: AgentProfile | null): string {
  if (!p) return "student profile: could not be read (do not state anything about the student's profile)";
  if (!p.recordExists) return "student profile: no profile record exists; no education or experience is stored";
  const L: string[] = [
    `student profile: nationality: ${v(p.personal.nationality)}; city: ${v(p.personal.city)}; full name: ${p.personal.fullName ? "recorded" : "not recorded"}`,
    `education records (${p.education.length}${p.omitted.education ? `, plus ${p.omitted.education} not shown` : ""}${p.education.length ? ", most recent start first" : ""}):${p.education.length ? "" : " none stored"}`,
  ];
  p.education.forEach((e, i) => L.push(`  ${i + 1}. level: ${v(e.level)}; degree: ${v(e.degreeName)}; field: ${v(e.field)}; institution: ${v(e.institution)}; CGPA: ${e.cgpa === null ? "not recorded" : `${e.cgpa}${e.cgpaScale === null ? " (scale not recorded)" : ` out of ${e.cgpaScale}`}`}; started: ${v(e.startDate)}; graduation: ${v(e.expectedGraduation)}`));
  L.push(`experience records (${p.experiences.length}${p.omitted.experiences ? `, plus ${p.omitted.experiences} not shown` : ""}):${p.experiences.length ? "" : " none stored"}`);
  p.experiences.forEach((x, i) => L.push(`  ${i + 1}. type: ${v(x.type)}; title: ${v(x.title)}; organization: ${v(x.organization)}; from: ${v(x.startDate)}; to: ${v(x.endDate, "not recorded (may be ongoing; not stated)")}${x.description ? `; description: ${x.description}` : ""}`));
  L.push(`not in the stored profile: ${p.missing.length ? p.missing.join("; ") : "nothing from the stored fields"}`);
  const out = L.join("\n");
  const max = CFG.digestChars;
  return out.length <= max ? out : out.slice(0, max - 40).replace(/\n[^\n]*$/, "") + "\n(profile list shortened; more records exist)";
}
