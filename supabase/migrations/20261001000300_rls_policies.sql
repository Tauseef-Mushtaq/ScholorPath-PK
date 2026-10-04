-- Module 03 / 3 of 4 — Row Level Security + least-privilege grants.
--
-- Supabase auto-grants ALL privileges on new public tables to anon/authenticated/service_role,
-- leaving RLS as the only guard. Here every table is first stripped of anon/authenticated
-- privileges and then granted only what each role needs. Column-level grants make server-owned
-- columns (role, verification_status, processing_status, ownership keys) unwritable by clients.
-- service_role bypasses RLS and keeps full access (server-side only).
--
-- FUTURE MIGRATIONS: new tables will again receive Supabase's default broad grants. Always
-- `enable row level security`, then revoke/grant explicitly as done here.

-- ---------------------------------------------------------------------------
-- Ownership helpers (SECURITY DEFINER: avoid recursive RLS evaluation)
-- ---------------------------------------------------------------------------
create or replace function public.owns_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.applications a
    where a.id = p_application_id and a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_profile(uuid) from public, anon;
revoke all on function public.owns_application(uuid) from public, anon;
grant execute on function public.owns_profile(uuid) to authenticated, service_role;
grant execute on function public.owns_application(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles                 enable row level security;
alter table public.education                enable row level security;
alter table public.experiences              enable row level security;
alter table public.documents                enable row level security;
alter table public.countries                enable row level security;
alter table public.universities             enable row level security;
alter table public.programs                 enable row level security;
alter table public.scholarships             enable row level security;
alter table public.scholarship_sources      enable row level security;
alter table public.scholarship_requirements enable row level security;
alter table public.applications             enable row level security;
alter table public.application_tasks        enable row level security;
alter table public.mentors                  enable row level security;
alter table public.admin_actions            enable row level security;

-- ---------------------------------------------------------------------------
-- Reset client privileges, then grant minimally
-- ---------------------------------------------------------------------------
revoke all on table
  public.profiles, public.education, public.experiences, public.documents,
  public.countries, public.universities, public.programs,
  public.scholarships, public.scholarship_sources, public.scholarship_requirements,
  public.applications, public.application_tasks, public.mentors, public.admin_actions
from anon, authenticated;

-- profiles: read own (admin: all). Only profile fields are writable; no insert/delete by clients.
grant select on public.profiles to authenticated;
grant update (full_name, nationality, city, date_of_birth) on public.profiles to authenticated;

-- education / experiences: owner CRUD; profile_id is immutable after insert.
grant select, delete on public.education, public.experiences to authenticated;
grant insert (profile_id, level, degree_name, field, institution, cgpa, cgpa_scale, start_date, expected_graduation)
  on public.education to authenticated;
grant update (level, degree_name, field, institution, cgpa, cgpa_scale, start_date, expected_graduation)
  on public.education to authenticated;
grant insert (profile_id, experience_type, title, organization, description, start_date, end_date)
  on public.experiences to authenticated;
grant update (experience_type, title, organization, description, start_date, end_date)
  on public.experiences to authenticated;

-- documents: owner manages metadata; processing_status / extracted_text_reference are server-owned.
grant select, delete on public.documents to authenticated;
grant insert (user_id, document_type, file_name, storage_path, mime_type, file_size) on public.documents to authenticated;
grant update (document_type, file_name) on public.documents to authenticated;

-- Reference + scholarship data: public read; writes only pass RLS for admins.
grant select on public.countries, public.universities, public.programs,
  public.scholarships, public.scholarship_sources, public.scholarship_requirements to anon, authenticated;
grant insert, update, delete on public.countries, public.universities, public.programs,
  public.scholarships, public.scholarship_sources, public.scholarship_requirements to authenticated;

-- applications / tasks: owner CRUD; ownership keys immutable after insert.
grant select, delete on public.applications, public.application_tasks to authenticated;
grant insert (user_id, scholarship_id, status, started_at, notes) on public.applications to authenticated;
grant update (status, started_at, submitted_at, result_date, notes) on public.applications to authenticated;
grant insert (application_id, title, description, status, due_date, source_id, required)
  on public.application_tasks to authenticated;
grant update (title, description, status, due_date, source_id, required) on public.application_tasks to authenticated;

-- mentors: applicants submit/edit claims; verification_status / verified_at are server/admin-owned
-- (changed with the service role; there is deliberately no client write path).
grant select on public.mentors to anon, authenticated;
grant delete on public.mentors to authenticated;
grant insert (user_id, scholarship_id, university_id, country_id, degree_level, field, award_year)
  on public.mentors to authenticated;
grant update (scholarship_id, university_id, country_id, degree_level, field, award_year)
  on public.mentors to authenticated;

-- admin_actions: append-only (no update/delete for anyone but service_role).
grant select, insert on public.admin_actions to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- education
create policy education_select_own on public.education for select to authenticated
  using (public.owns_profile(profile_id));
create policy education_select_admin on public.education for select to authenticated
  using (public.is_admin());
create policy education_insert_own on public.education for insert to authenticated
  with check (public.owns_profile(profile_id));
create policy education_update_own on public.education for update to authenticated
  using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy education_delete_own on public.education for delete to authenticated
  using (public.owns_profile(profile_id));

-- experiences
create policy experiences_select_own on public.experiences for select to authenticated
  using (public.owns_profile(profile_id));
create policy experiences_select_admin on public.experiences for select to authenticated
  using (public.is_admin());
create policy experiences_insert_own on public.experiences for insert to authenticated
  with check (public.owns_profile(profile_id));
create policy experiences_update_own on public.experiences for update to authenticated
  using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy experiences_delete_own on public.experiences for delete to authenticated
  using (public.owns_profile(profile_id));

-- documents: owner only. NO admin policy: admins reach documents only through explicit
-- server-side (service role) operations (docs/PAGES_AUTHORIZATION.md "restricted").
create policy documents_select_own on public.documents for select to authenticated
  using (user_id = (select auth.uid()));
create policy documents_insert_own on public.documents for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy documents_update_own on public.documents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy documents_delete_own on public.documents for delete to authenticated
  using (user_id = (select auth.uid()));

-- countries / universities / programs: public read, admin write
create policy countries_select_public on public.countries for select to anon, authenticated using (true);
create policy countries_admin_all on public.countries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy universities_select_public on public.universities for select to anon, authenticated using (true);
create policy universities_admin_all on public.universities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy programs_select_public on public.programs for select to anon, authenticated using (true);
create policy programs_admin_all on public.programs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- scholarships: public only when active; admin sees/manages everything
create policy scholarships_select_active on public.scholarships for select to anon, authenticated
  using (status = 'active');
create policy scholarships_admin_all on public.scholarships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- sources / requirements: public only for active scholarships (and active sources)
create policy scholarship_sources_select_public on public.scholarship_sources for select to anon, authenticated
  using (active and exists (select 1 from public.scholarships s where s.id = scholarship_id and s.status = 'active'));
create policy scholarship_sources_admin_all on public.scholarship_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy scholarship_requirements_select_public on public.scholarship_requirements for select to anon, authenticated
  using (exists (select 1 from public.scholarships s where s.id = scholarship_id and s.status = 'active'));
create policy scholarship_requirements_admin_all on public.scholarship_requirements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- applications: owner CRUD (new applications only against active scholarships); admin read
create policy applications_select_own on public.applications for select to authenticated
  using (user_id = (select auth.uid()));
create policy applications_select_admin on public.applications for select to authenticated
  using (public.is_admin());
create policy applications_insert_own on public.applications for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.scholarships s where s.id = scholarship_id and s.status = 'active')
  );
create policy applications_update_own on public.applications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy applications_delete_own on public.applications for delete to authenticated
  using (user_id = (select auth.uid()));

-- application_tasks: via ownership of the parent application; admin read
create policy application_tasks_select_own on public.application_tasks for select to authenticated
  using (public.owns_application(application_id));
create policy application_tasks_select_admin on public.application_tasks for select to authenticated
  using (public.is_admin());
create policy application_tasks_insert_own on public.application_tasks for insert to authenticated
  with check (public.owns_application(application_id));
create policy application_tasks_update_own on public.application_tasks for update to authenticated
  using (public.owns_application(application_id)) with check (public.owns_application(application_id));
create policy application_tasks_delete_own on public.application_tasks for delete to authenticated
  using (public.owns_application(application_id));

-- mentors: verified rows are public; owners see/manage their own claim; admin reads all.
-- Applicants always start 'pending' (column default; status is not insertable by clients).
create policy mentors_select_verified on public.mentors for select to anon, authenticated
  using (verification_status = 'verified');
create policy mentors_select_own on public.mentors for select to authenticated
  using (user_id = (select auth.uid()));
create policy mentors_select_admin on public.mentors for select to authenticated
  using (public.is_admin());
create policy mentors_insert_own on public.mentors for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy mentors_update_own on public.mentors for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy mentors_delete_own on public.mentors for delete to authenticated
  using (user_id = (select auth.uid()));

-- admin_actions: admin read + append own actions; nobody edits history
create policy admin_actions_select_admin on public.admin_actions for select to authenticated
  using (public.is_admin());
create policy admin_actions_insert_admin on public.admin_actions for insert to authenticated
  with check (public.is_admin() and admin_user_id = (select auth.uid()));
