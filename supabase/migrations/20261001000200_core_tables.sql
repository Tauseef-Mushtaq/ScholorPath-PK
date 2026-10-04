-- Module 03 / 2 of 4 — Core tables, relationships and indexes (docs/DATABASE.md sections 2,3,4,6,7).
-- Foundation only: no business logic. RAG (5), community (8), AI (9), application_documents/
-- application_drafts, mentor_stories/timelines/answers and scholarship_documents belong to later
-- modules and are intentionally NOT created here.

-- ---------------------------------------------------------------------------
-- education / experiences (children of profiles)
-- ---------------------------------------------------------------------------
create table public.education (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles (id) on delete cascade,
  level               text,
  degree_name         text,
  field               text,
  institution         text,
  cgpa                numeric(4, 2),
  cgpa_scale          numeric(4, 2),
  start_date          date,
  expected_graduation date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint education_cgpa_range check (cgpa is null or cgpa >= 0),
  constraint education_cgpa_scale_range check (cgpa_scale is null or cgpa_scale > 0),
  constraint education_cgpa_le_scale check (cgpa is null or cgpa_scale is null or cgpa <= cgpa_scale)
);
create index education_profile_id_idx on public.education (profile_id);
create trigger education_set_updated_at before update on public.education
  for each row execute function public.set_updated_at();

create table public.experiences (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  experience_type text,
  title           text,
  organization    text,
  description     text,
  start_date      date,
  end_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint experiences_dates_ordered check (start_date is null or end_date is null or end_date >= start_date)
);
create index experiences_profile_id_idx on public.experiences (profile_id);
create trigger experiences_set_updated_at before update on public.experiences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- documents (metadata only; files live in the private "documents" storage bucket)
-- Path convention: <user_id>/<object name>. Enforced here AND by storage policies.
-- ---------------------------------------------------------------------------
create table public.documents (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  document_type            text,
  file_name                text not null,
  storage_path             text not null unique,
  mime_type                text not null,
  file_size                bigint not null,
  processing_status        text not null default 'pending',
  extracted_text_reference text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint documents_path_in_owner_folder check (left(storage_path, 37) = user_id::text || '/'),
  constraint documents_mime_allowed check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  constraint documents_size_limit check (file_size > 0 and file_size <= 10485760),
  constraint documents_status_allowed check (processing_status in ('pending', 'processing', 'processed', 'failed'))
);
create index documents_user_id_idx on public.documents (user_id);
create index documents_user_id_type_idx on public.documents (user_id, document_type);
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reference data: countries, universities, programs
-- ---------------------------------------------------------------------------
create table public.countries (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  code   text not null unique constraint countries_code_len check (char_length(code) between 2 and 3),
  region text,
  slug   text not null unique
);

create table public.universities (
  id         uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries (id) on delete restrict,
  name       text not null,
  website    text constraint universities_website_http check (website ~* '^https?://'),
  slug       text not null unique
);
create index universities_country_id_idx on public.universities (country_id);

create table public.programs (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name          text not null,
  degree_level  text,
  field         text,
  website       text constraint programs_website_http check (website ~* '^https?://')
);
create index programs_university_id_idx on public.programs (university_id);
create index programs_degree_level_idx on public.programs (degree_level);

-- ---------------------------------------------------------------------------
-- Scholarships, their sources and requirements
-- ---------------------------------------------------------------------------
create table public.scholarships (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  provider                  text not null,
  country_id                uuid not null references public.countries (id) on delete restrict,
  university_id             uuid references public.universities (id) on delete set null,
  degree_level              text not null,
  field                     text,
  funding_type              text not null
                              constraint scholarships_funding_type_check
                              check (funding_type in ('fully_funded', 'partially_funded', 'not_funded')),
  tuition_coverage          text,
  stipend_details           text,
  accommodation_details     text,
  travel_details            text,
  insurance_details         text,
  eligibility_summary       text,
  minimum_gpa               numeric(4, 2),
  minimum_gpa_scale         numeric(4, 2),
  english_requirement_summary text,
  application_fee           numeric(10, 2),
  opening_date              date,
  deadline                  date,
  official_information_url  text constraint scholarships_info_url_http check (official_information_url ~* '^https?://'),
  official_application_url  text constraint scholarships_apply_url_http check (official_application_url ~* '^https?://'),
  status                    text not null default 'draft'
                              constraint scholarships_status_check check (status in ('draft', 'active', 'archived')),
  last_verified_at          timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint scholarships_gpa_range check (minimum_gpa is null or minimum_gpa >= 0),
  constraint scholarships_gpa_scale_range check (minimum_gpa_scale is null or minimum_gpa_scale > 0),
  constraint scholarships_fee_range check (application_fee is null or application_fee >= 0),
  constraint scholarships_dates_ordered check (opening_date is null or deadline is null or deadline >= opening_date)
);
create trigger scholarships_set_updated_at before update on public.scholarships
  for each row execute function public.set_updated_at();

-- Public listing/filter paths only ever see status = 'active', so those indexes are partial.
create index scholarships_university_id_idx on public.scholarships (university_id);
create index scholarships_active_country_idx on public.scholarships (country_id) where status = 'active';
create index scholarships_active_degree_idx on public.scholarships (degree_level) where status = 'active';
create index scholarships_active_funding_idx on public.scholarships (funding_type) where status = 'active';
create index scholarships_active_deadline_idx on public.scholarships (deadline) where status = 'active';

create table public.scholarship_sources (
  id               uuid primary key default gen_random_uuid(),
  scholarship_id   uuid not null references public.scholarships (id) on delete cascade,
  source_url       text not null constraint scholarship_sources_url_http check (source_url ~* '^https?://'),
  source_name      text,
  source_type      text,
  priority         integer not null default 0,
  last_verified_at timestamptz,
  content_hash     text,
  active           boolean not null default true
);
create index scholarship_sources_scholarship_idx on public.scholarship_sources (scholarship_id, active);

create table public.scholarship_requirements (
  id               uuid primary key default gen_random_uuid(),
  scholarship_id   uuid not null references public.scholarships (id) on delete cascade,
  requirement_type text not null,
  title            text not null,
  description      text,
  required         boolean not null default true,
  structured_value jsonb,
  source_id        uuid references public.scholarship_sources (id) on delete set null
);
create index scholarship_requirements_scholarship_idx on public.scholarship_requirements (scholarship_id);
create index scholarship_requirements_source_idx on public.scholarship_requirements (source_id);

-- ---------------------------------------------------------------------------
-- Applications and tasks
-- ---------------------------------------------------------------------------
create table public.applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  scholarship_id uuid not null references public.scholarships (id) on delete restrict,
  status         text not null default 'planning',
  started_at     timestamptz,
  submitted_at   timestamptz,
  result_date    date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index applications_user_id_idx on public.applications (user_id);
create index applications_scholarship_id_idx on public.applications (scholarship_id);
create trigger applications_set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

create table public.application_tasks (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  title          text not null,
  description    text,
  status         text not null default 'todo',
  due_date       date,
  source_id      uuid references public.scholarship_sources (id) on delete set null,
  required       boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index application_tasks_application_due_idx on public.application_tasks (application_id, due_date);
create index application_tasks_source_idx on public.application_tasks (source_id);
create trigger application_tasks_set_updated_at before update on public.application_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mentors (verification state is admin/server-controlled; see RLS migration)
-- ---------------------------------------------------------------------------
create table public.mentors (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users (id) on delete cascade,
  verification_status text not null default 'pending'
                        constraint mentors_verification_status_check
                        check (verification_status in ('pending', 'verified', 'rejected')),
  scholarship_id      uuid references public.scholarships (id) on delete set null,
  university_id       uuid references public.universities (id) on delete set null,
  country_id          uuid references public.countries (id) on delete set null,
  degree_level        text,
  field               text,
  award_year          smallint constraint mentors_award_year_range check (award_year between 1900 and 2100),
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint mentors_verified_at_consistent check (verified_at is null or verification_status = 'verified')
);
create index mentors_verification_status_idx on public.mentors (verification_status);
