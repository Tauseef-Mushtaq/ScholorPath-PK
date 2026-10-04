export {
  REVIEW_CATEGORIES,
  REVIEW_SEVERITIES,
  OVERALL_STATUSES,
  CORE_WRITING_TYPES,
  EXPECTED_DOCUMENT_TYPES,
  isReviewCategory,
  isReviewSeverity,
  isOverallStatus,
  categoryLabel,
  type ReviewCategory,
  type ReviewSeverity,
  type OverallStatus,
} from "./constants";

export type {
  ReviewItem,
  ApplicationHealth,
  ReviewProfileInput,
  ReviewDocumentInput,
  ReviewDraftInput,
  ReviewTaskInput,
  ReviewScholarshipInput,
  ReviewEligibilityInput,
  ReviewInput,
} from "./types";

export { buildApplicationHealth } from "./health";
export { checkProfileCompleteness, checkDocumentCompleteness, checkWritingReadiness, checkTaskCompleteness } from "./completeness";
export { checkConsistency, extractGpaMentions } from "./consistency";
export { checkDeadline, daysUntil } from "./deadline";
export { checkEligibilityItems } from "./eligibility-items";
