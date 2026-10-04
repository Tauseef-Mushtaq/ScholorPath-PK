# Curated scholarship dataset — import workflow (Module 07)

**This repository contains NO scholarship records.** No verified dataset was supplied, and none was fabricated. Do not commit invented scholarships, deadlines, amounts or URLs.

## Workflow
1. Countries/universities must already exist (they are referenced by slug). Adding them is outside Module 07's UI (no admin UI for them yet); insert via SQL/dashboard.
2. Verify each scholarship against its OFFICIAL source first.
3. Sign in as an admin, open `/admin/scholarships/import`, paste a JSON array (max 50 records, 200 KB), submit.
4. Records are created as **drafts** (never published by import), all-or-nothing, rejecting duplicates (same name + provider + country).
5. Records may carry an optional `sources` array (max 5 of `{source_url, source_name?, source_type?}`, http/https only). Sources are created active but **unverified**; if source insertion fails the scholarships are rolled back.
6. Open each draft, add/check sources, use "Mark verified now" on the source(s) and the scholarship only after actually checking the official site, then Publish.
7. **Publish gate (enforced in `changeScholarshipStatus`, `readiness.ts`):** publishing is refused unless required fields exist, an official info/application URL is set, at least one active http(s) source exists and has been verified, and the scholarship itself was marked verified. A fresh import can therefore never become public without a human check.

Duplicates: same name + provider + country, compared case-insensitively against the whole country's existing records and within the batch; any clash rejects the entire import.

Limitation: the gate is application-level (admin server actions). A DB trigger was NOT added (no Postgres in the repair environment to test it); admins with direct SQL/dashboard access can still set `status='active'`.

## Record format
Allowed keys: `country_slug` (required), `university_slug` (optional, must belong to that country), `name`, `provider`, `degree_level`, `funding_type` (`fully_funded|partially_funded|not_funded`) — required — and optional `field`, `tuition_coverage`, `stipend_details`, `accommodation_details`, `travel_details`, `insurance_details`, `eligibility_summary`, `minimum_gpa`, `minimum_gpa_scale`, `english_requirement_summary`, `application_fee`, `opening_date` (YYYY-MM-DD), `deadline` (YYYY-MM-DD), `official_information_url`, `official_application_url` (http/https), `sources` (see below). Any other key (`status`, `id`, `last_verified_at`, ...) rejects the whole import.

Placeholder shape (NOT real data — do not import):
```json
[{"country_slug":"<existing-country-slug>","name":"<verified name>","provider":"<verified provider>","degree_level":"Master","funding_type":"fully_funded","deadline":"YYYY-MM-DD","official_information_url":"https://<official-site>/"}]
```
Sources are not imported; add them in the editor (the `last_verified_at` timestamps are only ever set by an admin clicking "Mark verified now").
