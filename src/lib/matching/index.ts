export * from "./types";
export { evaluateScholarship, deriveStatus, deriveDecision, availabilityOf } from "./eligibility";
export { explainResult, STATUS_LABEL, STATUS_DESCRIPTION, DECISION_LABEL, DECISION_DESCRIPTION, PROFILE_HREF } from "./explain";
export type { MatchExplanation, MissingItem } from "./explain";
export { assessProfile } from "./profile-gaps";
export type { ProfileAssessment, Readiness } from "./profile-gaps";
export { buildMatches, compareResults, PUBLIC_STATUS } from "./rank";
export { parseMatchParams, matchesHref } from "./params";
export type { MatchParams } from "./params";
