export type FundingType = "fully_funded" | "partially_funded" | "not_funded";

export type CountrySummary = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  scholarshipCount: number;
};

export type ScholarshipListItem = {
  id: string;
  name: string;
  provider: string;
  degreeLevel: string;
  field: string | null;
  fundingType: FundingType;
  deadline: string | null;
  country: { name: string; slug: string } | null;
  university: { name: string } | null;
};

export type ScholarshipRequirement = {
  id: string;
  requirementType: string;
  title: string;
  description: string | null;
  required: boolean;
  /** Source row this requirement came from (null when unrecorded or the source is not public). */
  sourceId: string | null;
};

export type ScholarshipSource = {
  id: string;
  sourceUrl: string;
  sourceName: string | null;
  sourceType: string | null;
  priority: number;
  lastVerifiedAt: string | null;
};

export type ScholarshipDetail = ScholarshipListItem & {
  tuitionCoverage: string | null;
  stipendDetails: string | null;
  accommodationDetails: string | null;
  travelDetails: string | null;
  insuranceDetails: string | null;
  eligibilitySummary: string | null;
  minimumGpa: number | null;
  minimumGpaScale: number | null;
  englishRequirementSummary: string | null;
  applicationFee: number | null;
  openingDate: string | null;
  officialInformationUrl: string | null;
  officialApplicationUrl: string | null;
  lastVerifiedAt: string | null;
  university: { name: string; website: string | null } | null;
  requirements: ScholarshipRequirement[];
  sources: ScholarshipSource[];
};

export type CountryDetail = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  universities: { id: string; name: string; slug: string; website: string | null }[];
};

export type ScholarshipFilters = {
  q?: string;
  country?: string;
  degree?: string;
  field?: string;
  funding?: FundingType;
  /** University slug (only universities that have at least one public scholarship are offered). */
  university?: string;
  /** Deadline falls within the next N days (never includes past deadlines). */
  deadlineDays?: 30 | 90 | 180;
  openOnly?: boolean;
  sort: "deadline" | "name";
  page: number;
};

export type FilterOptions = {
  countries: { name: string; slug: string }[];
  universities: { name: string; slug: string }[];
  degrees: string[];
  fields: string[];
};
