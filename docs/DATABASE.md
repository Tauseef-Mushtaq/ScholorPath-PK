# ScholarPath PK — Database Plan

## 1. Conventions

- UUID primary keys for application entities
- timestamps in UTC
- created_at and updated_at where relevant
- foreign keys for relationships
- indexes on searchable/filterable fields
- RLS on user-owned and private data

## 2. Core Identity

### profiles
Suggested fields:
- id
- user_id
- role (student|mentor|admin)
- full_name
- nationality
- city
- date_of_birth (only if genuinely required)
- created_at
- updated_at

### education
- id
- profile_id
- level
- degree_name
- field
- institution
- cgpa
- cgpa_scale
- start_date
- expected_graduation

### experiences
- id
- profile_id
- experience_type
- title
- organization
- description
- start_date
- end_date

## 3. Documents

### documents
- id
- user_id
- document_type
- file_name
- storage_path
- mime_type
- file_size
- processing_status
- extracted_text_reference
- created_at
- updated_at

Private by default.

## 4. Scholarship Entities

### countries
- id
- name
- code
- region
- slug

### universities
- id
- country_id
- name
- website
- slug

### programs
- id
- university_id
- name
- degree_level
- field
- website

### scholarships
- id
- name
- provider
- country_id
- university_id nullable
- degree_level
- field
- funding_type (fully_funded|partially_funded|not_funded)
- tuition_coverage
- stipend_details
- accommodation_details
- travel_details
- insurance_details
- eligibility_summary
- minimum_gpa
- minimum_gpa_scale
- english_requirement_summary
- application_fee
- opening_date
- deadline
- official_information_url
- official_application_url
- status
- last_verified_at
- created_at
- updated_at

### scholarship_requirements
- id
- scholarship_id
- requirement_type
- title
- description
- required
- structured_value
- source_id

### scholarship_documents
- id
- scholarship_id
- document_type
- description
- required
- source_id

### scholarship_sources
- id
- scholarship_id
- source_url
- source_name
- source_type
- priority
- last_verified_at
- content_hash
- active

## 5. RAG

### knowledge_documents
- id
- scholarship_id nullable
- topic_type
- title
- source_url
- source_type
- version
- last_verified_at
- active

### knowledge_chunks
- id
- knowledge_document_id
- content
- embedding
- page_number nullable
- section nullable
- metadata jsonb
- created_at

RLS/permissions must prevent student-private content from becoming visible through shared retrieval.

## 6. Applications

### applications
- id
- user_id
- scholarship_id
- status
- started_at
- submitted_at
- result_date
- notes
- created_at
- updated_at

### application_tasks
- id
- application_id
- title
- description
- status
- due_date
- source_id nullable
- required
- created_at
- updated_at

### application_documents
- id
- application_id
- document_id
- status
- notes

### application_drafts
- id
- application_id
- draft_type
- content
- version
- ai_generated
- user_approved
- created_at

## 7. Mentors

### mentors
- id
- user_id
- verification_status
- scholarship_id nullable
- university_id nullable
- country_id nullable
- degree_level nullable
- field nullable
- award_year nullable
- verified_at nullable

### mentor_stories
- id
- mentor_id
- title
- body
- status
- published_at
- created_at
- updated_at

### mentor_timelines
- id
- mentor_id
- title
- date_or_period
- description
- sort_order

### mentor_answers
- id
- mentor_id
- question_id nullable
- question
- answer
- status
- created_at

## 8. Community / Moderation

### reports
- id
- reporter_user_id
- target_type
- target_id
- reason
- description
- status
- resolved_by
- resolved_at

## 9. AI

### ai_sessions
- id
- user_id
- context_type
- context_id
- provider
- model
- created_at

### ai_messages
- id
- session_id
- role
- content
- metadata
- created_at

### ai_usage
- id
- user_id nullable
- provider
- model
- request_type
- token_estimate nullable
- success
- error_code nullable
- created_at

## 10. Admin Audit

### admin_actions
- id
- admin_user_id
- action_type
- target_type
- target_id
- metadata
- created_at

## 11. RLS Principles

- A user can read/write their own profile.
- A user can read/write their own documents.
- A user can read/write their own applications/tasks/drafts.
- Public scholarship records are readable when status is active/public.
- Public mentor stories are readable only when published.
- Mentor can only edit their own mentor profile/stories.
- Admin has privileged management access.
- Admin role must be granted outside normal public registration.
- No user can grant themselves mentor/admin status.

## 12. Implementation Notes (Module 03)

Migrations: `supabase/migrations/20261001000100`…`20261001000400` (profiles+roles, core tables, RLS+grants, storage). See DECISIONS ADR-018–022.

- Implemented: profiles, education, experiences, documents, countries, universities, programs, scholarships, scholarship_sources, scholarship_requirements, applications, application_tasks, mentors, admin_actions.
- Not yet created (owned by later modules): scholarship_documents, RAG tables, application_documents, application_drafts, mentor_stories/timelines/answers, reports, ai_*.
- Types chosen where this document was silent: `scholarships.deadline/opening_date` = `date`; `application_fee` = `numeric(10,2)` (no currency column yet); `scholarships.status` = `draft|active|archived` (public when `active`); `mentors.verification_status` = `pending|verified|rejected`; `documents.processing_status` = `pending|processing|processed|failed`; `structured_value` = `jsonb`.
- `profiles.user_id` is unique and references `auth.users(id)`; `id` is the app-level UUID that education/experiences reference.
- Role changes: `public.set_user_role()` (service role only). Helper functions: `is_admin()`, `current_user_role()`, `owns_profile()`, `owns_application()`.
- Module 06 (Document Vault): no schema change, no migration. `documents.document_type` stays nullable free text; the app restricts it to the list in `src/lib/documents/constants.ts` (ADR-028). `processing_status` / `extracted_text_reference` remain server-owned and are not shown or written by the vault. Object path convention `<user_id>/<uuid>.<ext>` is generated server-side.


## 13. Module 09 note

No schema change. Matching reads existing columns only (`scholarships.degree_level/field/minimum_gpa/minimum_gpa_scale/english_requirement_summary/eligibility_summary/deadline/status`, `scholarship_requirements.*`, the student's own `profiles` + `education`). Gaps documented in ADR-031: no scholarship nationality/age/language-score columns, no student preference or language-test fields, `structured_value` has no defined shape. Adding any of them needs a new migration + RLS review + an extension of `src/lib/matching/eligibility.ts`.

## 14. Module 10 note — Pakistan-side steps (convention, no migration)

There is no Pakistan-specific table or column. Module 10 reads **`scholarship_requirements` rows whose `requirement_type` is `pakistan_side`** (see ADR-032): `title` = the step, `description` = detail, `required` = required/optional, `source_id` = the `scholarship_sources` row that documents it (strongly recommended: rows without a source are shown as "unconfirmed"). Create them with SQL or the service role until an admin editor exists; replace the angle-bracket placeholders with real, verified values and never invent guidance:

```sql
insert into public.scholarship_requirements (scholarship_id, requirement_type, title, description, required, source_id)
values ('<scholarship uuid>', 'pakistan_side', '<step title>', '<details from the official source>', true, '<source uuid>');
```

The matching engine ignores these rows. `scholarship_documents` is listed in section 4 but no migration creates it; required documents are currently represented as ordinary requirement rows.



## 15. Module 11 — RAG tables (migration `20261002000100_rag_knowledge_base.sql`, ADR-033)

Extension: `vector` (schema `extensions`). Fixed embedding size: `vector(768)` (gemini-embedding-001, `outputDimensionality=768`). A different model/size needs a NEW migration.

**knowledge_documents** — `id`, `source_id` (UNIQUE, FK → `scholarship_sources` ON DELETE CASCADE), `scholarship_id` (FK, nullable), `topic_type` ('scholarship'), `title`, `source_url` (http/https CHECK), `source_type`, `source_priority`, `last_verified_at` (snapshot), `version`, `content_hash`, `processing_status` (pending|processing|ready|failed), `error_code` (CHECK `^[a-z0-9_]{1,64}$`), `chunk_count`, `embedding_model`, `embedding_dimensions`, `chunking_version`, `last_attempt_at`, `ingested_at`, `active`, `created_at`, `updated_at`. CHECKs: `ready` ⇒ `ingested_at` set, no error, `chunk_count > 0`; `failed` ⇒ `error_code` set.

**knowledge_chunks** — `id`, `knowledge_document_id` (FK CASCADE), `chunk_index` (UNIQUE per document), `content` (1–8000 chars), `embedding vector(768)`, `page_number` (null for HTML), `section`, `metadata` jsonb, `content_hash`, `created_at`. Index: HNSW `vector_cosine_ops`.

**Privileges/RLS:** RLS on both; all default grants revoked from `public/anon/authenticated`; `authenticated` SELECT + admin-only (`is_admin()`) policy; `service_role` full DML (ingestion). No client insert/update/delete for anyone.

**`public.match_knowledge_chunks(query_embedding, match_count=8, min_similarity=null, filter_scholarship_id=null)`** — SECURITY INVOKER, `service_role` only. Returns chunks + recorded source fields + `similarity` (= 1 − cosine distance; not a probability). Only rows where document `active` ∧ `ready`, source `active` ∧ `last_verified_at is not null`, scholarship `status = 'active'`. `match_count` clamped to 1..20.

**Test DB requirement:** `npm run test:db` now needs pgvector in the local Postgres (the harness fails early with a clear message if missing). The 53 new SQL checks in `tests/db/rls.test.sql` have **not been run** (see HANDOFF).


## Module 17 additions
- `mentor_stories`, `mentor_timelines`, `mentor_questions`, `mentor_answers` with RLS (see migration `20261003000400_mentor_community.sql`).
- Admin may update `mentors.verification_status` / `verified_at` when `is_admin()`.
- Helpers: `owns_mentor(uuid)`, `is_verified_mentor()`.


## Module 18 additions
- `reports` table with RLS (reporter own + admin all). See `20261003000500_reports_and_hardening.sql`.
