-- Module 03 security tests: RLS, grants, role architecture, storage policies, indexes.
-- Runs inside ONE transaction that is ROLLED BACK (leaves no data). Written to be portable, but in
-- this repo it has only been run against LOCAL Postgres + tests/db/shim.sql (NOT live Supabase).
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
begin;

create schema test;
grant usage on schema test to public;
create table test.results (n serial primary key, name text not null, pass boolean not null, detail text);
grant all on test.results to public;
grant usage on all sequences in schema test to public;

-- run a statement, report 'rows:N' or 'err:SQLSTATE'
create function test.run(q text) returns text language plpgsql as $$
declare n bigint;
begin
  execute q; get diagnostics n = row_count; return 'rows:' || n;
exception when others then return 'err:' || sqlstate;
end $$;
-- assertion helpers
create function test.record(p_name text, p_pass boolean, p_detail text) returns void language sql as
  $$ insert into test.results (name, pass, detail) values (p_name, p_pass, p_detail) $$;
create function test.allow(p_name text, q text) returns void language plpgsql as $$
declare r text := test.run(q);
begin perform test.record('ALLOW ' || p_name, r ~ '^rows:[1-9]', r); end $$;
create function test.deny(p_name text, q text) returns void language plpgsql as $$
declare r text := test.run(q);
begin perform test.record('DENY  ' || p_name, r in ('rows:0', 'err:42501'), r); end $$;
create function test.err(p_name text, q text, p_state text) returns void language plpgsql as $$
declare r text := test.run(q);
begin perform test.record('ERROR ' || p_name || ' (' || p_state || ')', r = 'err:' || p_state, r); end $$;
create function test.rows(p_name text, q text, p_n int) returns void language plpgsql as $$
declare r text := test.run(q);
begin perform test.record('ROWS  ' || p_name || ' = ' || p_n, r = 'rows:' || p_n, r); end $$;
create function test.check(p_name text, ok boolean) returns void language sql as
  $$ select test.record('CHECK ' || p_name, coalesce(ok, false), null) $$;
-- impersonate: as(uid, 'authenticated'|'anon'|'service_role'); as(null,'postgres')-style reset via reset role
create function test.as(p_uid uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', p_role)::text
         else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  reset role;
  execute format('set local role %I', p_role);
end $$;
create function test.as_owner() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claims', '', true); end $$;
grant execute on all functions in schema test to public;

\o /dev/null
-- ===========================================================================
-- Fixtures (as table owner / operator)
-- ===========================================================================
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@example.test', '{}', '{}'),
 ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@example.test', '{}', '{}'),
 ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'm@example.test', '{}', '{}'),
 ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'ad@example.test', '{}', '{}'),
 -- signup that tries to smuggle a role through user_metadata (what a malicious client could send)
 ('55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'e@example.test', '{}', '{"role":"admin"}');

select test.check('signup trigger created a profile for every new user',
  (select count(*) from public.profiles where user_id in
    ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
     '33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',
     '55555555-5555-5555-5555-555555555555')) = 5);
select test.check('new users default to student',
  (select count(*) from public.profiles where role = 'student' and user_id in
    ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')) = 2);
select test.check('user_metadata.role=admin at signup is IGNORED (profile is student)',
  (select role from public.profiles where user_id = '55555555-5555-5555-5555-555555555555') = 'student');
select test.check('backfill: app_metadata admin preserved',   (select role from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1') = 'admin');
select test.check('backfill: app_metadata mentor preserved',  (select role from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a2') = 'mentor');
select test.check('backfill: no role -> student',             (select role from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a3') = 'student');
select test.check('backfill: unknown role value -> student',  (select role from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a4') = 'student');
select test.check('backfill: user_metadata admin NOT trusted',(select role from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a5') = 'student');

-- Grant mentor/admin the supported way (service role only)
select test.as(null, 'service_role');
select public.set_user_role('33333333-3333-3333-3333-333333333333', 'mentor');
select public.set_user_role('44444444-4444-4444-4444-444444444444', 'admin');
select test.as_owner();
select test.check('set_user_role (service_role) promoted mentor + admin',
  (select role from public.profiles where user_id = '33333333-3333-3333-3333-333333333333') = 'mentor'
  and (select role from public.profiles where user_id = '44444444-4444-4444-4444-444444444444') = 'admin');
select test.check('set_user_role wrote audit rows with from/to',
  (select count(*) from public.admin_actions where action_type = 'set_user_role' and metadata ->> 'to' in ('mentor','admin') and metadata ->> 'from' = 'student') = 2);

select id as pa from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' \gset
select id as pb from public.profiles where user_id = '22222222-2222-2222-2222-222222222222' \gset

insert into public.countries (id, name, code, slug) values ('c0000000-0000-0000-0000-000000000001', 'Testland', 'TL', 'testland');
insert into public.universities (id, country_id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Test University', 'test-university');
insert into public.scholarships (id, name, provider, country_id, degree_level, funding_type, status) values
 ('d0000000-0000-0000-0000-000000000001', 'Active Scholarship', 'P', 'c0000000-0000-0000-0000-000000000001', 'masters', 'fully_funded', 'active'),
 ('d0000000-0000-0000-0000-000000000002', 'Draft Scholarship',  'P', 'c0000000-0000-0000-0000-000000000001', 'masters', 'fully_funded', 'draft');
insert into public.scholarship_sources (id, scholarship_id, source_url, active) values
 ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'https://example.test/a', true),
 ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'https://example.test/old', false),
 ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'https://example.test/d', true);
insert into public.scholarship_requirements (id, scholarship_id, requirement_type, title) values
 ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'english', 'IELTS 6.5'),
 ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'english', 'Draft req');
-- User B's private data
insert into public.education (profile_id, level) values (:'pb', 'bachelor');
insert into public.experiences (profile_id, title) values (:'pb', 'B internship');
insert into public.documents (id, user_id, file_name, storage_path, mime_type, file_size) values
 ('b1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'cv.pdf',
  '22222222-2222-2222-2222-222222222222/cv.pdf', 'application/pdf', 1000);
insert into storage.buckets (id, name, public) values ('other', 'other', false);
insert into storage.objects (bucket_id, name, owner) values
 ('documents', '22222222-2222-2222-2222-222222222222/cv.pdf', '22222222-2222-2222-2222-222222222222');
insert into public.applications (id, user_id, scholarship_id) values
 ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001');
insert into public.application_tasks (id, application_id, title) values
 ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'B task');
insert into public.mentors (user_id, degree_level) values ('22222222-2222-2222-2222-222222222222', 'masters'); -- B: pending
insert into public.mentors (user_id, degree_level, verification_status, verified_at)
  values ('33333333-3333-3333-3333-333333333333', 'masters', 'verified', now());                           -- M: verified

-- ===========================================================================
-- Static schema/grant audit (as owner)
-- ===========================================================================
select test.check('RLS enabled on every public table',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0);
select test.check('anon has NO privileges on user-owned tables',
  not exists (select 1 from unnest(array['profiles','education','experiences','documents','applications','application_tasks','admin_actions']) t
              cross join unnest(array['select','insert','update','delete']) p
              where has_table_privilege('anon', 'public.' || t, p)));
select test.check('anon cannot write any public table',
  not exists (select 1 from information_schema.tables t cross join unnest(array['insert','update','delete']) p
              where t.table_schema = 'public' and has_table_privilege('anon', 'public.' || t.table_name, p)));
select test.check('authenticated has NO update on profiles.role / user_id / id',
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'id', 'update'));
select test.check('authenticated cannot write mentors.verification_status/verified_at',
  not has_column_privilege('authenticated', 'public.mentors', 'verification_status', 'update')
  and not has_column_privilege('authenticated', 'public.mentors', 'verified_at', 'update')
  and not has_column_privilege('authenticated', 'public.mentors', 'verification_status', 'insert'));
select test.check('authenticated cannot write documents.processing_status',
  not has_column_privilege('authenticated', 'public.documents', 'processing_status', 'update')
  and not has_column_privilege('authenticated', 'public.documents', 'processing_status', 'insert'));
select test.check('documents bucket is PRIVATE with size limit and MIME allow-list',
  (select not public and file_size_limit = 10485760 and allowed_mime_types is not null from storage.buckets where id = 'documents'));
select test.check('expected indexes exist',
  (select count(*) from pg_indexes where schemaname = 'public' and indexname in (
    'scholarships_active_country_idx','scholarships_active_degree_idx','scholarships_active_funding_idx',
    'scholarships_active_deadline_idx','scholarships_university_id_idx','applications_user_id_idx',
    'applications_scholarship_id_idx','documents_user_id_idx','education_profile_id_idx','experiences_profile_id_idx',
    'application_tasks_application_due_idx','scholarship_requirements_scholarship_idx','scholarship_sources_scholarship_idx',
    'universities_country_id_idx','programs_university_id_idx','mentors_verification_status_idx')) = 16);
update public.profiles set updated_at = '2000-01-01', city = 'X' where user_id = '55555555-5555-5555-5555-555555555555';
select test.check('updated_at trigger overrides client-supplied timestamp',
  (select updated_at > '2020-01-01' from public.profiles where user_id = '55555555-5555-5555-5555-555555555555'));

-- ===========================================================================
-- USER A (student)
-- ===========================================================================
select test.as('11111111-1111-1111-1111-111111111111', 'authenticated');

-- profiles / role
select test.allow('User A -> own profile', $q$select 1 from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.rows('User A sees only its own profile row', $q$select 1 from public.profiles$q$, 1);
select test.deny('User A -> User B profile', $q$select 1 from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'$q$);
select test.allow('User A updates own full_name', $q$update public.profiles set full_name = 'Alice' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('User A updates User B profile', $q$update public.profiles set full_name = 'hacked' where user_id = '22222222-2222-2222-2222-222222222222'$q$);
select test.deny('Student -> change own role to admin', $q$update public.profiles set role = 'admin' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('Student -> change own role to mentor', $q$update public.profiles set role = 'mentor' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('Student -> become admin by re-pointing user_id', $q$update public.profiles set user_id = '44444444-4444-4444-4444-444444444444' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('Student -> insert own admin profile', $q$insert into public.profiles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'admin')$q$);
select test.deny('Student -> delete own profile', $q$delete from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.err('Student cannot call set_user_role', $q$select public.set_user_role('11111111-1111-1111-1111-111111111111', 'admin')$q$, '42501');

-- education / experiences
select test.allow('User A inserts own education', $q$insert into public.education (profile_id, level) values ((select id from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'), 'masters')$q$);
select test.deny('User A inserts education for User B profile', format($q$insert into public.education (profile_id, level) values (%L, 'x')$q$, :'pb'));
select test.allow('User A -> own education', $q$select 1 from public.education$q$);
select test.rows('User A sees only own education (B has one too)', $q$select 1 from public.education$q$, 1);
select test.deny('User A updates User B education', $q$update public.education set level = 'hacked' where level = 'bachelor'$q$);
select test.deny('User A deletes User B education', $q$delete from public.education where level = 'bachelor'$q$);
select test.deny('User A re-parents own education to User B', format($q$update public.education set profile_id = %L$q$, :'pb'));
select test.allow('User A inserts own experience', $q$insert into public.experiences (profile_id, title) values ((select id from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'), 'A job')$q$);
select test.deny('User A inserts experience for User B', format($q$insert into public.experiences (profile_id, title) values (%L, 'x')$q$, :'pb'));
select test.rows('User A sees only own experiences', $q$select 1 from public.experiences$q$, 1);
select test.deny('User A deletes User B experience', $q$delete from public.experiences where title = 'B internship'$q$);

-- ---- Module 05: student profile CRUD exactly as the app performs it (whitelisted columns only) ----
select test.allow('M05 A updates own full_name/nationality/city/date_of_birth', $q$update public.profiles set full_name = 'Alice A', nationality = 'Pakistani', city = 'Lahore', date_of_birth = '2001-02-03' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.check('M05 A role is still student after all profile writes', (select role from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') = 'student');
select test.err('M05 profile full_name > 200 chars rejected', $q$update public.profiles set full_name = repeat('x', 201) where user_id = '11111111-1111-1111-1111-111111111111'$q$, '23514');
select test.err('M05 profile city > 100 chars rejected', $q$update public.profiles set city = repeat('x', 101) where user_id = '11111111-1111-1111-1111-111111111111'$q$, '23514');
select test.deny('M05 A cannot move own profile row (id)', $q$update public.profiles set id = gen_random_uuid() where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.allow('M05 A inserts a full education record', $q$insert into public.education (profile_id, level, degree_name, field, institution, cgpa, cgpa_scale, start_date, expected_graduation) values ((select id from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'), 'bachelor', 'BSc CS', 'Computer Science', 'M05 University', 3.5, 4, '2019-09-01', '2023-06-30')$q$);
select test.allow('M05 A updates own education', $q$update public.education set cgpa = 3.6, field = 'CS' where institution = 'M05 University'$q$);
select test.deny('M05 A cannot change profile_id of own education (no column grant)', format($q$update public.education set profile_id = %L where institution = 'M05 University'$q$, :'pb'));
select test.err('M05 education cgpa above scale rejected', $q$update public.education set cgpa = 5 where institution = 'M05 University'$q$, '23514');
select test.err('M05 education negative cgpa rejected', $q$update public.education set cgpa = -1 where institution = 'M05 University'$q$, '23514');
select test.err('M05 education zero scale rejected', $q$update public.education set cgpa_scale = 0 where institution = 'M05 University'$q$, '23514');
select test.err('M05 education numeric(4,2) overflow rejected', $q$update public.education set cgpa = 100, cgpa_scale = 100 where institution = 'M05 University'$q$, '22003');
select test.rows('M05 A cannot see User B education by id', format($q$select 1 from public.education where profile_id = %L$q$, :'pb'), 0);
select test.deny('M05 A cannot update B education by id', format($q$update public.education set field = 'x' where profile_id = %L$q$, :'pb'));
select test.allow('M05 A deletes own education', $q$delete from public.education where institution = 'M05 University'$q$);
select test.allow('M05 A inserts a full experience record', $q$insert into public.experiences (profile_id, experience_type, title, organization, description, start_date, end_date) values ((select id from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'), 'internship', 'M05 Intern', 'Org', 'Did things', '2022-06-01', '2022-08-31')$q$);
select test.allow('M05 A updates own experience', $q$update public.experiences set organization = 'Org 2' where title = 'M05 Intern'$q$);
select test.deny('M05 A cannot change profile_id of own experience', format($q$update public.experiences set profile_id = %L where title = 'M05 Intern'$q$, :'pb'));
select test.err('M05 experience end before start rejected', $q$update public.experiences set end_date = '2022-01-01' where title = 'M05 Intern'$q$, '23514');
select test.allow('M05 A deletes own experience', $q$delete from public.experiences where title = 'M05 Intern'$q$);
select test.rows('M05 A still has exactly its original education/experience rows', $q$select 1 from public.education union all select 1 from public.experiences$q$, 2);

-- documents (metadata)
select test.allow('User A -> inserts own document metadata', $q$insert into public.documents (user_id, document_type, file_name, storage_path, mime_type, file_size) values ('11111111-1111-1111-1111-111111111111', 'transcript', 't.pdf', '11111111-1111-1111-1111-111111111111/t.pdf', 'application/pdf', 1000)$q$);
select test.allow('User A -> own document', $q$select 1 from public.documents where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.rows('User A sees only own documents', $q$select 1 from public.documents$q$, 1);
select test.deny('User A -> User B document', $q$select 1 from public.documents where id = 'b1000000-0000-0000-0000-000000000001'$q$);
select test.deny('User A updates User B document', $q$update public.documents set file_name = 'x' where id = 'b1000000-0000-0000-0000-000000000001'$q$);
select test.deny('User A deletes User B document', $q$delete from public.documents where id = 'b1000000-0000-0000-0000-000000000001'$q$);
select test.deny('User A inserts a document owned by User B', $q$insert into public.documents (user_id, file_name, storage_path, mime_type, file_size) values ('22222222-2222-2222-2222-222222222222', 'x.pdf', '22222222-2222-2222-2222-222222222222/x.pdf', 'application/pdf', 10)$q$);
select test.err('document path must be inside own folder', $q$insert into public.documents (user_id, file_name, storage_path, mime_type, file_size) values ('11111111-1111-1111-1111-111111111111', 'x.pdf', '22222222-2222-2222-2222-222222222222/x.pdf', 'application/pdf', 10)$q$, '23514');
select test.err('document MIME allow-list enforced', $q$insert into public.documents (user_id, file_name, storage_path, mime_type, file_size) values ('11111111-1111-1111-1111-111111111111', 'x.html', '11111111-1111-1111-1111-111111111111/x.html', 'text/html', 10)$q$, '23514');
select test.err('document size limit enforced (>10 MB)', $q$insert into public.documents (user_id, file_name, storage_path, mime_type, file_size) values ('11111111-1111-1111-1111-111111111111', 'big.pdf', '11111111-1111-1111-1111-111111111111/big.pdf', 'application/pdf', 10485761)$q$, '23514');
select test.deny('User A cannot set processing_status on insert', $q$insert into public.documents (user_id, file_name, storage_path, mime_type, file_size, processing_status) values ('11111111-1111-1111-1111-111111111111', 'p.pdf', '11111111-1111-1111-1111-111111111111/p.pdf', 'application/pdf', 10, 'processed')$q$);
select test.deny('User A cannot update processing_status', $q$update public.documents set processing_status = 'processed' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('User A cannot re-assign document to User B', $q$update public.documents set user_id = '22222222-2222-2222-2222-222222222222' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.allow('User A renames own document', $q$update public.documents set file_name = 'renamed.pdf' where user_id = '11111111-1111-1111-1111-111111111111'$q$);

-- storage objects (private files)
select test.allow('User A uploads into own folder', $q$insert into storage.objects (bucket_id, name, owner) values ('documents', '11111111-1111-1111-1111-111111111111/t.pdf', '11111111-1111-1111-1111-111111111111')$q$);
select test.deny('User A uploads into User B folder', $q$insert into storage.objects (bucket_id, name, owner) values ('documents', '22222222-2222-2222-2222-222222222222/evil.pdf', '11111111-1111-1111-1111-111111111111')$q$);
select test.deny('User A uploads outside own folder (bucket root)', $q$insert into storage.objects (bucket_id, name, owner) values ('documents', 'loose.pdf', '11111111-1111-1111-1111-111111111111')$q$);
select test.deny('User A uploads to a bucket without a policy', $q$insert into storage.objects (bucket_id, name, owner) values ('other', '11111111-1111-1111-1111-111111111111/t.pdf', '11111111-1111-1111-1111-111111111111')$q$);
select test.allow('User A -> own file', $q$select 1 from storage.objects where bucket_id = 'documents' and name like '11111111-%'$q$);
select test.rows('User A sees only own files', $q$select 1 from storage.objects where bucket_id = 'documents'$q$, 1);
select test.deny('User A -> User B file', $q$select 1 from storage.objects where name = '22222222-2222-2222-2222-222222222222/cv.pdf'$q$);
select test.deny('User A overwrites User B file', $q$update storage.objects set name = name where name = '22222222-2222-2222-2222-222222222222/cv.pdf'$q$);
select test.deny('User A deletes User B file', $q$delete from storage.objects where name = '22222222-2222-2222-2222-222222222222/cv.pdf'$q$);
select test.deny('User A moves own file into User B folder', $q$update storage.objects set name = '22222222-2222-2222-2222-222222222222/moved.pdf' where name = '11111111-1111-1111-1111-111111111111/t.pdf'$q$);
select test.allow('User A deletes own file', $q$delete from storage.objects where name = '11111111-1111-1111-1111-111111111111/t.pdf'$q$);

-- applications / tasks
select test.allow('User A applies to an ACTIVE scholarship', $q$insert into public.applications (user_id, scholarship_id) values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001')$q$);
select test.deny('User A applies to a DRAFT scholarship', $q$insert into public.applications (user_id, scholarship_id) values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000002')$q$);
select test.deny('User A creates an application owned by User B', $q$insert into public.applications (user_id, scholarship_id) values ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001')$q$);
select test.rows('User A sees only own applications', $q$select 1 from public.applications$q$, 1);
select test.deny('User A -> User B application', $q$select 1 from public.applications where id = 'b0000000-0000-0000-0000-000000000001'$q$);
select test.allow('User A updates own application status', $q$update public.applications set status = 'in_progress' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('User A updates User B application', $q$update public.applications set status = 'x' where id = 'b0000000-0000-0000-0000-000000000001'$q$);
select test.deny('User A deletes User B application', $q$delete from public.applications where id = 'b0000000-0000-0000-0000-000000000001'$q$);
select test.deny('User A re-assigns own application to User B', $q$update public.applications set user_id = '22222222-2222-2222-2222-222222222222' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.allow('User A adds a task to own application', $q$insert into public.application_tasks (application_id, title) select id, 'A task' from public.applications where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('User A adds a task to User B application', $q$insert into public.application_tasks (application_id, title) values ('b0000000-0000-0000-0000-000000000001', 'evil')$q$);
select test.rows('User A sees only own tasks', $q$select 1 from public.application_tasks$q$, 1);
select test.deny('User A updates User B task', $q$update public.application_tasks set title = 'x' where id = 'a0000000-0000-0000-0000-000000000001'$q$);
select test.deny('User A deletes User B task', $q$delete from public.application_tasks where id = 'a0000000-0000-0000-0000-000000000001'$q$);
select test.deny('User A moves own task into User B application', $q$update public.application_tasks set application_id = 'b0000000-0000-0000-0000-000000000001' where title = 'A task'$q$);

-- scholarship data (student = read-only, active only)
select test.allow('Student reads ACTIVE scholarship', $q$select 1 from public.scholarships where id = 'd0000000-0000-0000-0000-000000000001'$q$);
select test.deny('Student reads DRAFT scholarship', $q$select 1 from public.scholarships where id = 'd0000000-0000-0000-0000-000000000002'$q$);
select test.allow('Student reads requirement of active scholarship', $q$select 1 from public.scholarship_requirements where id = 'f0000000-0000-0000-0000-000000000001'$q$);
select test.deny('Student reads requirement of draft scholarship', $q$select 1 from public.scholarship_requirements where id = 'f0000000-0000-0000-0000-000000000002'$q$);
select test.allow('Student reads active source', $q$select 1 from public.scholarship_sources where id = 'e0000000-0000-0000-0000-000000000001'$q$);
select test.deny('Student reads inactive source', $q$select 1 from public.scholarship_sources where id = 'e0000000-0000-0000-0000-000000000002'$q$);
select test.deny('Student reads source of draft scholarship', $q$select 1 from public.scholarship_sources where id = 'e0000000-0000-0000-0000-000000000003'$q$);
select test.deny('Student inserts scholarship', $q$insert into public.scholarships (name, provider, country_id, degree_level, funding_type) values ('x','x','c0000000-0000-0000-0000-000000000001','masters','fully_funded')$q$);
select test.deny('Student updates scholarship', $q$update public.scholarships set status = 'draft' where id = 'd0000000-0000-0000-0000-000000000001'$q$);
select test.deny('Student deletes scholarship', $q$delete from public.scholarships where id = 'd0000000-0000-0000-0000-000000000001'$q$);
select test.deny('Student inserts requirement', $q$insert into public.scholarship_requirements (scholarship_id, requirement_type, title) values ('d0000000-0000-0000-0000-000000000001','x','x')$q$);
select test.deny('Student inserts country', $q$insert into public.countries (name, code, slug) values ('X','XX','x')$q$);
select test.allow('Student reads countries (public reference data)', $q$select 1 from public.countries$q$);

-- mentors
select test.allow('User A submits a mentor application', $q$insert into public.mentors (user_id, degree_level) values ('11111111-1111-1111-1111-111111111111', 'masters')$q$);
select test.deny('User A inserts a pre-VERIFIED mentor row', $q$insert into public.mentors (user_id, verification_status) values ('11111111-1111-1111-1111-111111111111', 'verified')$q$);
select test.deny('Student -> self-verify as mentor', $q$update public.mentors set verification_status = 'verified' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('Student -> set own verified_at', $q$update public.mentors set verified_at = now() where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('User A submits a mentor application as User B', $q$insert into public.mentors (user_id) values ('22222222-2222-2222-2222-222222222222')$q$);
select test.allow('User A edits own mentor claim', $q$update public.mentors set award_year = 2024 where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('User A reads User B pending mentor row', $q$select 1 from public.mentors where user_id = '22222222-2222-2222-2222-222222222222'$q$);
select test.deny('User A edits User B mentor row', $q$update public.mentors set award_year = 1999 where user_id = '22222222-2222-2222-2222-222222222222'$q$);
select test.allow('User A reads VERIFIED mentor (public)', $q$select 1 from public.mentors where verification_status = 'verified'$q$);

-- admin-only data
select test.deny('Student reads admin_actions', $q$select 1 from public.admin_actions$q$);
select test.deny('Student writes admin_actions', $q$insert into public.admin_actions (admin_user_id, action_type) values ('11111111-1111-1111-1111-111111111111', 'x')$q$);

-- ===========================================================================
-- ANON (signed out)
-- ===========================================================================
select test.as(null, 'anon');
select test.deny('anon -> profiles', $q$select 1 from public.profiles$q$);
select test.deny('anon -> documents', $q$select 1 from public.documents$q$);
select test.deny('anon -> applications', $q$select 1 from public.applications$q$);
select test.deny('anon -> admin_actions', $q$select 1 from public.admin_actions$q$);
select test.deny('anon -> storage files', $q$select 1 from storage.objects$q$);
select test.allow('anon reads ACTIVE scholarship', $q$select 1 from public.scholarships where status = 'active'$q$);
select test.deny('anon reads DRAFT scholarship', $q$select 1 from public.scholarships where status = 'draft'$q$);
select test.allow('anon reads active scholarship requirements', $q$select 1 from public.scholarship_requirements$q$);
select test.allow('anon reads VERIFIED mentors', $q$select 1 from public.mentors where verification_status = 'verified'$q$);
select test.deny('anon reads PENDING mentors', $q$select 1 from public.mentors where verification_status = 'pending'$q$);
select test.deny('anon inserts scholarship', $q$insert into public.scholarships (name, provider, country_id, degree_level, funding_type) values ('x','x','c0000000-0000-0000-0000-000000000001','masters','fully_funded')$q$);
select test.err('anon cannot call set_user_role', $q$select public.set_user_role('11111111-1111-1111-1111-111111111111', 'admin')$q$, '42501');

-- ===========================================================================
-- MENTOR (verified, role=mentor) — must NOT gain admin powers
-- ===========================================================================
select test.as('33333333-3333-3333-3333-333333333333', 'authenticated');
select test.allow('Mentor -> own profile', $q$select 1 from public.profiles where user_id = '33333333-3333-3333-3333-333333333333'$q$);
select test.deny('Mentor -> other users profiles', $q$select 1 from public.profiles where user_id <> '33333333-3333-3333-3333-333333333333'$q$);
select test.deny('Mentor -> promote self to admin', $q$update public.profiles set role = 'admin' where user_id = '33333333-3333-3333-3333-333333333333'$q$);
select test.deny('Mentor -> change own verification_status', $q$update public.mentors set verification_status = 'rejected' where user_id = '33333333-3333-3333-3333-333333333333'$q$);
select test.allow('Mentor edits own mentor profile', $q$update public.mentors set award_year = 2023 where user_id = '33333333-3333-3333-3333-333333333333'$q$);
select test.deny('Mentor edits another mentor profile', $q$update public.mentors set award_year = 1999 where user_id = '22222222-2222-2222-2222-222222222222'$q$);
select test.deny('Mentor inserts scholarship (admin-only data)', $q$insert into public.scholarships (name, provider, country_id, degree_level, funding_type) values ('x','x','c0000000-0000-0000-0000-000000000001','masters','fully_funded')$q$);
select test.deny('Mentor updates scholarship', $q$update public.scholarships set name = 'x' where id = 'd0000000-0000-0000-0000-000000000001'$q$);
select test.deny('Mentor reads DRAFT scholarship', $q$select 1 from public.scholarships where status = 'draft'$q$);
select test.deny('Mentor reads admin_actions', $q$select 1 from public.admin_actions$q$);
select test.deny('Mentor reads student documents', $q$select 1 from public.documents$q$);
select test.deny('Mentor reads student applications', $q$select 1 from public.applications$q$);
select test.deny('Mentor reads student files', $q$select 1 from storage.objects$q$);
select test.err('Mentor cannot call set_user_role', $q$select public.set_user_role('33333333-3333-3333-3333-333333333333', 'admin')$q$, '42501');

-- ===========================================================================
-- ADMIN — intended privileged access, but still no client role changes / no document access
-- ===========================================================================
select test.as('44444444-4444-4444-4444-444444444444', 'authenticated');
select test.rows('Admin reads all profiles (A and B)', $q$select 1 from public.profiles where user_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')$q$, 2);
select test.allow('Admin reads DRAFT scholarship', $q$select 1 from public.scholarships where status = 'draft'$q$);
select test.allow('Admin creates country', $q$insert into public.countries (name, code, slug) values ('Adminland','AL','adminland')$q$);
select test.allow('Admin creates scholarship', $q$insert into public.scholarships (name, provider, country_id, degree_level, funding_type) values ('Admin S','x','c0000000-0000-0000-0000-000000000001','masters','partially_funded')$q$);
select test.allow('Admin updates scholarship', $q$update public.scholarships set status = 'active' where name = 'Admin S'$q$);
select test.allow('Admin adds source', $q$insert into public.scholarship_sources (scholarship_id, source_url) values ('d0000000-0000-0000-0000-000000000002', 'https://example.test/x')$q$);
select test.allow('Admin adds requirement', $q$insert into public.scholarship_requirements (scholarship_id, requirement_type, title) values ('d0000000-0000-0000-0000-000000000002','x','new')$q$);
select test.allow('Admin deletes requirement', $q$delete from public.scholarship_requirements where title = 'new'$q$);
select test.allow('Admin reads all mentors incl. pending', $q$select 1 from public.mentors where verification_status = 'pending'$q$);
select test.allow('Admin reads student applications', $q$select 1 from public.applications where id = 'b0000000-0000-0000-0000-000000000001'$q$);
select test.allow('Admin reads student education', $q$select 1 from public.education$q$);
select test.deny('Admin writes into a student education record', format($q$insert into public.education (profile_id, level) values (%L, 'x')$q$, :'pb'));
select test.deny('Admin reads student document metadata (restricted)', $q$select 1 from public.documents$q$);
select test.deny('Admin reads student files (restricted)', $q$select 1 from storage.objects$q$);
select test.deny('Admin changes another user role via client', $q$update public.profiles set role = 'admin' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select test.deny('Admin changes own role via client', $q$update public.profiles set role = 'student' where user_id = '44444444-4444-4444-4444-444444444444'$q$);
select test.deny('Admin verifies a mentor via client (server-only)', $q$update public.mentors set verification_status = 'verified' where user_id = '22222222-2222-2222-2222-222222222222'$q$);
select test.err('Admin cannot call set_user_role from the client', $q$select public.set_user_role('11111111-1111-1111-1111-111111111111', 'admin')$q$, '42501');
select test.allow('Admin reads admin_actions', $q$select 1 from public.admin_actions$q$);
select test.allow('Admin appends own audit entry', $q$insert into public.admin_actions (admin_user_id, action_type) values ('44444444-4444-4444-4444-444444444444', 'test')$q$);
select test.deny('Admin forges an audit entry for another admin', $q$insert into public.admin_actions (admin_user_id, action_type) values ('33333333-3333-3333-3333-333333333333', 'forged')$q$);
select test.deny('Admin edits audit history', $q$update public.admin_actions set action_type = 'x'$q$);
select test.deny('Admin deletes audit history', $q$delete from public.admin_actions$q$);

-- ===========================================================================
-- Module 07: admin scholarship management paths (local Postgres + shim, NOT live Supabase)
-- ===========================================================================
select test.as('44444444-4444-4444-4444-444444444444', 'authenticated');
select test.allow('M07 admin inserts a draft scholarship (all form columns)', $q$insert into public.scholarships (name, provider, country_id, university_id, degree_level, field, funding_type, tuition_coverage, minimum_gpa, minimum_gpa_scale, application_fee, opening_date, deadline, official_information_url, official_application_url, status) values ('M07 Draft','P','c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','masters','cs','fully_funded','all',3.00,4.00,10.50,'2027-01-01','2027-02-01','https://example.test/i','https://example.test/a','draft')$q$);
select test.err('M07 DB rejects invalid status value', $q$update public.scholarships set status = 'published' where name = 'M07 Draft'$q$, '23514');
select test.err('M07 DB rejects deadline before opening', $q$update public.scholarships set deadline = '2026-01-01' where name = 'M07 Draft'$q$, '23514');
select test.err('M07 DB rejects non-http URL', $q$update public.scholarships set official_information_url = 'javascript:alert(1)' where name = 'M07 Draft'$q$, '23514');
select test.err('M07 DB rejects invalid funding_type', $q$update public.scholarships set funding_type = 'free' where name = 'M07 Draft'$q$, '23514');
select test.err('M07 DB rejects negative fee', $q$update public.scholarships set application_fee = -1 where name = 'M07 Draft'$q$, '23514');
select test.err('M07 DB rejects unknown country', $q$insert into public.scholarships (name, provider, country_id, degree_level, funding_type) values ('x','x','99999999-0000-0000-0000-000000000000','m','not_funded')$q$, '23503');
select test.allow('M07 admin publishes (draft -> active)', $q$update public.scholarships set status = 'active' where name = 'M07 Draft'$q$);
select test.allow('M07 admin archives', $q$update public.scholarships set status = 'archived' where name = 'M07 Draft'$q$);
select test.allow('M07 admin updates source metadata', $q$update public.scholarships set last_verified_at = now() where name = 'M07 Draft'$q$);
select test.allow('M07 admin edits a source', $q$update public.scholarship_sources set priority = 2, active = false where id = 'e0000000-0000-0000-0000-000000000003'$q$);
select test.err('M07 DB rejects non-http source URL', $q$update public.scholarship_sources set source_url = 'ftp://x' where id = 'e0000000-0000-0000-0000-000000000003'$q$, '23514');
select test.err('M07 deleting a scholarship WITH applications is blocked (ON DELETE RESTRICT)', $q$delete from public.scholarships where id = 'd0000000-0000-0000-0000-000000000001'$q$, '23503');
select test.allow('M07 admin deletes a scholarship without applications', $q$delete from public.scholarships where name = 'M07 Draft'$q$);
select test.allow('M07 admin writes audit row for scholarship action', $q$insert into public.admin_actions (admin_user_id, action_type, target_type, target_id, metadata) values ('44444444-4444-4444-4444-444444444444','scholarship.status','scholarship','d0000000-0000-0000-0000-000000000002','{"from":"draft","to":"active"}')$q$);

-- Non-admins: students and mentors cannot write scholarships/sources, and cannot see drafts
select test.as('11111111-1111-1111-1111-111111111111', 'authenticated');
select test.deny('M07 student cannot insert scholarship', $q$insert into public.scholarships (name, provider, country_id, degree_level, funding_type) values ('S','p','c0000000-0000-0000-0000-000000000001','m','not_funded')$q$);
select test.rows('M07 student update of a scholarship affects 0 rows', $q$update public.scholarships set name = 'hacked' where id = 'd0000000-0000-0000-0000-000000000001' returning 1$q$, 0);
select test.rows('M07 student cannot publish a draft (0 rows)', $q$update public.scholarships set status = 'active' where id = 'd0000000-0000-0000-0000-000000000002' returning 1$q$, 0);
select test.rows('M07 student delete of scholarship affects 0 rows', $q$delete from public.scholarships where id = 'd0000000-0000-0000-0000-000000000001' returning 1$q$, 0);
select test.deny('M07 student cannot insert source', $q$insert into public.scholarship_sources (scholarship_id, source_url) values ('d0000000-0000-0000-0000-000000000001','https://x.test')$q$);
select test.rows('M07 student cannot see draft scholarships', $q$select 1 from public.scholarships where status = 'draft'$q$, 0);
select test.as('33333333-3333-3333-3333-333333333333', 'authenticated');
select test.deny('M07 mentor cannot insert scholarship', $q$insert into public.scholarships (name, provider, country_id, degree_level, funding_type) values ('S','p','c0000000-0000-0000-0000-000000000001','m','not_funded')$q$);
select test.rows('M07 mentor cannot publish a draft (0 rows)', $q$update public.scholarships set status = 'active' where id = 'd0000000-0000-0000-0000-000000000002' returning 1$q$, 0);
select test.as(null, 'anon');
select test.deny('M07 guest cannot insert scholarship', $q$insert into public.scholarships (name, provider, country_id, degree_level, funding_type) values ('S','p','c0000000-0000-0000-0000-000000000001','m','not_funded')$q$);
select test.rows('M07 guest sees no non-active (draft/archived) scholarships', $q$select 1 from public.scholarships where status <> 'active'$q$, 0);
select test.rows('M07 guest still sees the seeded ACTIVE scholarship', $q$select 1 from public.scholarships where id = 'd0000000-0000-0000-0000-000000000001'$q$, 1);
select test.as_owner();
select test.check('M07 archived scholarship is hidden from guests but the row exists', exists (select 1 from public.scholarships where status = 'draft'));

-- ===========================================================================
-- Module 08: public search + filter semantics as GUEST (local Postgres + shim; NOT PostgREST, NOT live Supabase).
-- The SQL below mirrors what src/lib/public/queries.ts asks PostgREST for; it proves the RLS visibility
-- boundary and the intended matching semantics, not the HTTP layer.
-- ===========================================================================
select test.as_owner();
insert into public.countries (id, name, code, slug) values ('c0000000-0000-0000-0000-000000000002', 'Searchland', 'SL', 'searchland');
insert into public.universities (id, country_id, name, slug) values ('c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Aurora Institute', 'aurora-institute');
insert into public.scholarships (id, name, provider, country_id, university_id, degree_level, field, funding_type, eligibility_summary, deadline, status) values
 ('d8000000-0000-0000-0000-000000000001', 'Aurora Excellence Award', 'Prov One', 'c0000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'Master', 'Data Science', 'fully_funded', 'Open to Pakistani nationals', '2099-01-01', 'active'),
 ('d8000000-0000-0000-0000-000000000002', 'Bridge Grant', 'Prov Two', 'c0000000-0000-0000-0000-000000000002', null, 'Bachelor', null, 'partially_funded', null, null, 'active'),
 ('d8000000-0000-0000-0000-000000000003', 'Aurora Secret Draft', 'Prov Three', 'c0000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'Master', 'Data Science', 'fully_funded', null, '2099-01-01', 'draft'),
 ('d8000000-0000-0000-0000-000000000004', 'Aurora Old Archive', 'Prov Four', 'c0000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'Master', 'Data Science', 'fully_funded', null, '2099-01-01', 'archived'),
 ('d8000000-0000-0000-0000-000000000005', 'Past Deadline Fellowship', 'Prov Five', 'c0000000-0000-0000-0000-000000000002', null, 'PhD', 'Physics', 'not_funded', null, '2000-01-01', 'active'),
 ('d8000000-0000-0000-0000-000000000006', 'Soon Closing Scheme', 'Prov Six', 'c0000000-0000-0000-0000-000000000002', null, 'Master', 'Physics', 'fully_funded', null, current_date + 10, 'active');
select test.as(null, 'anon');
-- visibility
select test.rows('M08 guest: country search returns only ACTIVE rows (not draft/archived)', $q$select 1 from public.scholarships s join public.countries c on c.id = s.country_id where c.name ilike '%searchland%'$q$, 4);
select test.rows('M08 guest: keyword hitting a draft/archived title finds only the active match', $q$select 1 from public.scholarships where name ilike '%aurora%'$q$, 1);
select test.rows('M08 guest: draft fetched by id is invisible', $q$select 1 from public.scholarships where id = 'd8000000-0000-0000-0000-000000000003'$q$, 0);
select test.rows('M08 guest: archived fetched by id is invisible', $q$select 1 from public.scholarships where id = 'd8000000-0000-0000-0000-000000000004'$q$, 0);
-- keyword search (each searched column + joins)
select test.rows('M08 search: university name only', $q$select 1 from public.scholarships s left join public.universities u on u.id = s.university_id where u.name ilike '%institute%' and s.name not ilike '%institute%'$q$, 1);
select test.rows('M08 search: country name', $q$select 1 from public.scholarships s join public.countries c on c.id = s.country_id where c.name ilike '%searchland%' or s.name ilike '%searchland%'$q$, 4);
select test.rows('M08 search: field is case-insensitive', $q$select 1 from public.scholarships where field ilike '%DATA SCIENCE%'$q$, 1);
select test.rows('M08 search: provider', $q$select 1 from public.scholarships where provider ilike '%prov two%'$q$, 1);
select test.rows('M08 search: degree_level', $q$select 1 from public.scholarships where degree_level ilike '%phd%' and country_id = 'c0000000-0000-0000-0000-000000000002'$q$, 1);
select test.rows('M08 search: eligibility_summary', $q$select 1 from public.scholarships where eligibility_summary ilike '%pakistani%'$q$, 1);
select test.rows('M08 search: tokens are ANDed (match)', $q$select 1 from public.scholarships s where (s.name ilike '%aurora%' or s.degree_level ilike '%aurora%') and (s.name ilike '%master%' or s.degree_level ilike '%master%')$q$, 1);
select test.rows('M08 search: tokens are ANDed (mismatch -> none)', $q$select 1 from public.scholarships s where (s.name ilike '%aurora%' or s.degree_level ilike '%aurora%') and (s.name ilike '%bachelor%' or s.degree_level ilike '%bachelor%')$q$, 0);
select test.rows('M08 search: no match -> empty result', $q$select 1 from public.scholarships where name ilike '%zzzznomatch%' or provider ilike '%zzzznomatch%'$q$, 0);
-- filters
select test.rows('M08 filter: country', $q$select 1 from public.scholarships where country_id = 'c0000000-0000-0000-0000-000000000002'$q$, 4);
select test.rows('M08 filter: university', $q$select 1 from public.scholarships where university_id = 'c1000000-0000-0000-0000-000000000002'$q$, 1);
select test.rows('M08 filter: degree', $q$select 1 from public.scholarships where degree_level = 'Master' and country_id = 'c0000000-0000-0000-0000-000000000002'$q$, 2);
select test.rows('M08 filter: field', $q$select 1 from public.scholarships where field = 'Physics'$q$, 2);
select test.rows('M08 filter: funding', $q$select 1 from public.scholarships where funding_type = 'partially_funded' and country_id = 'c0000000-0000-0000-0000-000000000002'$q$, 1);
select test.rows('M08 filter: deadline within 30 days (excludes past, null and far-future)', $q$select 1 from public.scholarships where deadline between current_date and current_date + 30$q$, 1);
select test.rows('M08 filter: hide closed keeps null deadlines, drops past', $q$select 1 from public.scholarships where country_id = 'c0000000-0000-0000-0000-000000000002' and (deadline is null or deadline >= current_date)$q$, 3);
-- combinations
select test.rows('M08 combined: country + degree + funding', $q$select 1 from public.scholarships where country_id = 'c0000000-0000-0000-0000-000000000002' and degree_level = 'Master' and funding_type = 'fully_funded'$q$, 2);
select test.rows('M08 combined: search + filter', $q$select 1 from public.scholarships where name ilike '%aurora%' and funding_type = 'fully_funded' and degree_level = 'Master'$q$, 1);
select test.rows('M08 combined: search + conflicting filter -> empty', $q$select 1 from public.scholarships where name ilike '%aurora%' and funding_type = 'not_funded'$q$, 0);
-- incomplete data
select test.rows('M08 incomplete data: row with null field/university/deadline is still listed by country', $q$select 1 from public.scholarships where id = 'd8000000-0000-0000-0000-000000000002'$q$, 1);
select test.rows('M08 incomplete data: filter options skip null fields', $q$select distinct field from public.scholarships where field is not null and country_id = 'c0000000-0000-0000-0000-000000000002'$q$, 2);
select test.rows('M08 filter options: a university with an active scholarship is derivable from public rows', $q$select distinct u.id from public.scholarships s join public.universities u on u.id = s.university_id where u.id = 'c1000000-0000-0000-0000-000000000002'$q$, 1);
-- guests still cannot write
select test.deny('M08 guest cannot modify a scholarship', $q$update public.scholarships set name = 'x' where id = 'd8000000-0000-0000-0000-000000000001'$q$);
select test.as_owner();

-- ===========================================================================
-- Defense in depth: even WITH a (mistaken) column grant, the trigger blocks client role changes
-- ===========================================================================
select test.as_owner();
grant update (role) on public.profiles to authenticated;
select test.as('11111111-1111-1111-1111-111111111111', 'authenticated');
select test.err('trigger blocks role change even if UPDATE(role) were granted', $q$update public.profiles set role = 'admin' where user_id = '11111111-1111-1111-1111-111111111111'$q$, '42501');
select test.as_owner();
revoke update (role) on public.profiles from authenticated;

-- ===========================================================================
-- Service role (server-side) path + input validation of set_user_role
-- ===========================================================================
select test.as(null, 'service_role');
select test.allow('service_role can set a role', $q$select public.set_user_role('55555555-5555-5555-5555-555555555555', 'mentor')$q$);
select test.err('set_user_role rejects unknown role', $q$select public.set_user_role('55555555-5555-5555-5555-555555555555', 'root')$q$, '22023');
select test.err('set_user_role rejects unknown user', $q$select public.set_user_role('99999999-9999-9999-9999-999999999999', 'student')$q$, 'P0002');
select test.err('set_user_role rejects a non-admin acting user', $q$select public.set_user_role('55555555-5555-5555-5555-555555555555', 'student', '11111111-1111-1111-1111-111111111111')$q$, '42501');
select test.allow('set_user_role accepts a real admin acting user', $q$select public.set_user_role('55555555-5555-5555-5555-555555555555', 'student', '44444444-4444-4444-4444-444444444444')$q$);
select test.as_owner();
select test.check('User A is STILL a student after all attempted escalations',
  (select role from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') = 'student');
select test.check('User B is STILL a student', (select role from public.profiles where user_id = '22222222-2222-2222-2222-222222222222') = 'student');
select test.check('Mentor is still mentor (not admin)', (select role from public.profiles where user_id = '33333333-3333-3333-3333-333333333333') = 'mentor');
select test.check('User A mentor application is still pending',
  (select verification_status from public.mentors where user_id = '11111111-1111-1111-1111-111111111111') = 'pending');
select test.check('User B document untouched', (select file_name from public.documents where id = 'b1000000-0000-0000-0000-000000000001') = 'cv.pdf');
select test.check('User B file still present', exists (select 1 from storage.objects where name = '22222222-2222-2222-2222-222222222222/cv.pdf'));
select test.check('User B profile untouched', (select full_name from public.profiles where user_id = '22222222-2222-2222-2222-222222222222') is null);


-- ===========================================================================
-- Module 11 — RAG knowledge base (knowledge_documents, knowledge_chunks, match_knowledge_chunks)
-- Requires pgvector in the test database (Supabase has it). Runs inside the same rolled-back transaction.
-- ===========================================================================
select test.as_owner();
create function test.vec(p_dim int) returns text language sql as $$
  select '[' || array_to_string(array_cat(array_fill(0.0::float8, array[p_dim]), array_cat(array[1.0::float8], array_fill(0.0::float8, array[767 - p_dim]))), ',') || ']' $$;
grant execute on function test.vec(int) to public;

-- fixtures: make the active source "verified" and add a second, never-verified source on the active scholarship
update public.scholarship_sources set last_verified_at = now() - interval '10 days' where id = 'e0000000-0000-0000-0000-000000000001';
insert into public.scholarship_sources (id, scholarship_id, source_url, active, last_verified_at) values
  ('e0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001', 'https://example.test/unverified', true, null),
  ('e0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-000000000002', 'https://example.test/draft2', true, now());
insert into public.knowledge_documents (id, source_id, scholarship_id, source_url, processing_status, chunk_count, ingested_at) values
  ('f1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'https://example.test/a', 'ready', 2, now()),
  ('f1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001', 'https://example.test/unverified', 'ready', 1, now()),
  ('f1000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-000000000002', 'https://example.test/draft2', 'ready', 1, now()),
  ('f1000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'https://example.test/old', 'ready', 1, now());
insert into public.knowledge_chunks (knowledge_document_id, chunk_index, content, embedding, section, content_hash)
select d, i, c, test.vec(v)::extensions.vector, sec, 'h' || d::text || i from (values
  ('f1000000-0000-0000-0000-000000000001'::uuid, 0, 'Chunk A (dim0)', 0, 'Overview'),
  ('f1000000-0000-0000-0000-000000000001'::uuid, 1, 'Chunk B (dim1)', 1, 'Deadline'),
  ('f1000000-0000-0000-0000-000000000002'::uuid, 0, 'Unverified source chunk', 0, null),
  ('f1000000-0000-0000-0000-000000000003'::uuid, 0, 'Draft scholarship chunk', 0, null),
  ('f1000000-0000-0000-0000-000000000004'::uuid, 0, 'Inactive source chunk', 0, null)) as x(d, i, c, v, sec);

select test.check('RLS enabled on knowledge_documents', (select relrowsecurity from pg_class where oid = 'public.knowledge_documents'::regclass));
select test.check('RLS enabled on knowledge_chunks', (select relrowsecurity from pg_class where oid = 'public.knowledge_chunks'::regclass));
select test.check('anon has no privileges on knowledge tables', not (has_table_privilege('anon', 'public.knowledge_documents', 'select') or has_table_privilege('anon', 'public.knowledge_chunks', 'select')
  or has_table_privilege('anon', 'public.knowledge_documents', 'insert') or has_table_privilege('anon', 'public.knowledge_chunks', 'insert')));
select test.check('authenticated has SELECT only (no insert/update/delete) on knowledge tables',
  has_table_privilege('authenticated', 'public.knowledge_documents', 'select') and has_table_privilege('authenticated', 'public.knowledge_chunks', 'select')
  and not (has_table_privilege('authenticated', 'public.knowledge_documents', 'insert') or has_table_privilege('authenticated', 'public.knowledge_documents', 'update') or has_table_privilege('authenticated', 'public.knowledge_documents', 'delete')
        or has_table_privilege('authenticated', 'public.knowledge_chunks', 'insert') or has_table_privilege('authenticated', 'public.knowledge_chunks', 'update') or has_table_privilege('authenticated', 'public.knowledge_chunks', 'delete')));
select test.check('embedding index is HNSW with cosine ops', exists (select 1 from pg_indexes where indexname = 'knowledge_chunks_embedding_idx' and indexdef ilike '%hnsw%' and indexdef ilike '%vector_cosine_ops%'));
select test.check('match function is SECURITY INVOKER', (select not prosecdef from pg_proc where proname = 'match_knowledge_chunks'));

-- anon / student / mentor: no read, no write
select test.as(null, 'anon');
select test.deny('anon reads knowledge_documents', $q$select 1 from public.knowledge_documents$q$);
select test.deny('anon reads knowledge_chunks', $q$select 1 from public.knowledge_chunks$q$);
select test.as('11111111-1111-1111-1111-111111111111', 'authenticated');
select test.deny('Student reads knowledge_documents', $q$select 1 from public.knowledge_documents$q$);
select test.deny('Student reads knowledge_chunks', $q$select 1 from public.knowledge_chunks$q$);
select test.deny('Student inserts knowledge_documents', $q$insert into public.knowledge_documents (source_id, source_url) values ('e0000000-0000-0000-0000-000000000003', 'https://example.test/x')$q$);
select test.deny('Student updates knowledge_documents', $q$update public.knowledge_documents set active = false$q$);
select test.deny('Student deletes knowledge_chunks', $q$delete from public.knowledge_chunks$q$);
select test.as('33333333-3333-3333-3333-333333333333', 'authenticated');
select test.deny('Mentor reads knowledge_chunks', $q$select 1 from public.knowledge_chunks$q$);
-- admin: read-only (private ingestion metadata visible to admins only); no client writes even for admins
select test.as('44444444-4444-4444-4444-444444444444', 'authenticated');
select test.allow('Admin reads knowledge_documents', $q$select 1 from public.knowledge_documents$q$);
select test.allow('Admin reads knowledge_chunks', $q$select 1 from public.knowledge_chunks$q$);
select test.deny('Admin cannot write knowledge_documents from the client', $q$update public.knowledge_documents set active = false$q$);
select test.deny('Admin cannot insert knowledge_chunks from the client', $q$insert into public.knowledge_chunks (knowledge_document_id, chunk_index, content, embedding, content_hash) values ('f1000000-0000-0000-0000-000000000001', 9, 'x', test.vec(0)::extensions.vector, 'h')$q$);
select test.deny('Admin cannot delete knowledge_chunks from the client', $q$delete from public.knowledge_chunks$q$);

-- the retrieval function is not callable by any client role
select test.as(null, 'anon');
select test.err('anon cannot execute match_knowledge_chunks', format($q$select * from public.match_knowledge_chunks(%L::extensions.vector)$q$, test.vec(0)), '42501');
select test.as('11111111-1111-1111-1111-111111111111', 'authenticated');
select test.err('Student cannot execute match_knowledge_chunks', format($q$select * from public.match_knowledge_chunks(%L::extensions.vector)$q$, test.vec(0)), '42501');
select test.as('44444444-4444-4444-4444-444444444444', 'authenticated');
select test.err('Admin client session cannot execute match_knowledge_chunks', format($q$select * from public.match_knowledge_chunks(%L::extensions.vector)$q$, test.vec(0)), '42501');

-- service role: ingestion writes + retrieval with visibility enforced INSIDE the function
select test.as(null, 'service_role');
select test.allow('service_role inserts a document', $q$insert into public.knowledge_documents (source_id, scholarship_id, source_url) values ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'https://example.test/d') returning 1$q$);
select test.allow('service_role updates a document', $q$update public.knowledge_documents set last_attempt_at = now() where source_id = 'e0000000-0000-0000-0000-000000000003'$q$);
select test.allow('service_role deletes a document', $q$delete from public.knowledge_documents where source_id = 'e0000000-0000-0000-0000-000000000003'$q$);
select test.allow('service_role inserts a chunk', format($q$insert into public.knowledge_chunks (knowledge_document_id, chunk_index, content, embedding, content_hash) values ('f1000000-0000-0000-0000-000000000001', 2, 'Chunk C', %L::extensions.vector, 'hc') returning 1$q$, test.vec(2)));
select test.allow('service_role can execute match_knowledge_chunks', format($q$select * from public.match_knowledge_chunks(%L::extensions.vector)$q$, test.vec(0)));
select test.check('match returns ONLY chunks of active, verified sources of active scholarships in ready docs',
  (select array_agg(content order by content) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20)) = array['Chunk A (dim0)', 'Chunk B (dim1)', 'Chunk C']);
select test.check('unverified source, draft scholarship and inactive source are never returned',
  not exists (select 1 from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20) where content in ('Unverified source chunk', 'Draft scholarship chunk', 'Inactive source chunk')));
select test.check('nearest chunk is first; similarity is cosine (1.0 for identical, 0.0 for orthogonal)',
  (select content = 'Chunk A (dim0)' and abs(similarity - 1.0) < 1e-6 from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20) limit 1)
  and (select abs(similarity) < 1e-6 from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20) where content = 'Chunk B (dim1)'));
select test.check('result carries source + scholarship references as recorded',
  (select source_url = 'https://example.test/a' and scholarship_id = 'd0000000-0000-0000-0000-000000000001' and source_id = 'e0000000-0000-0000-0000-000000000001' and source_last_verified_at is not null
     from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 1)));
select test.check('match_count is clamped (0 -> 1 row, 1000 -> at most 20)',
  (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 0)) = 1 and (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 1000)) <= 20);
select test.check('min_similarity filters', (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20, 0.5)) = 1);
select test.check('scholarship filter works (other scholarship -> nothing)',
  (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20, null, 'd0000000-0000-0000-0000-000000000002')) = 0
  and (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20, null, 'd0000000-0000-0000-0000-000000000001')) = 3);
select test.as_owner();
update public.knowledge_documents set processing_status = 'processing' where id = 'f1000000-0000-0000-0000-000000000001';
select test.check('a document that is not ready (e.g. re-ingesting) is not retrievable', (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20) where document_title is distinct from 'x') = 0);
update public.knowledge_documents set processing_status = 'ready', active = false where id = 'f1000000-0000-0000-0000-000000000001';
select test.check('an inactive document is not retrievable', (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20)) = 0);
update public.knowledge_documents set active = true where id = 'f1000000-0000-0000-0000-000000000001';
update public.scholarship_sources set last_verified_at = null where id = 'e0000000-0000-0000-0000-000000000001';
select test.check('un-verifying a source immediately removes its chunks from retrieval', (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20)) = 0);
update public.scholarship_sources set last_verified_at = now() where id = 'e0000000-0000-0000-0000-000000000001';
update public.scholarships set status = 'archived' where id = 'd0000000-0000-0000-0000-000000000001';
select test.check('archiving the scholarship removes its chunks from retrieval', (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20)) = 0);
update public.scholarships set status = 'active' where id = 'd0000000-0000-0000-0000-000000000001';
select test.check('restoring everything makes chunks retrievable again', (select count(*) from public.match_knowledge_chunks(test.vec(0)::extensions.vector, 20)) = 3);

-- constraints
select test.err('ready document must have chunks/ingested_at', $q$insert into public.knowledge_documents (source_id, source_url, processing_status) values ('e0000000-0000-0000-0000-000000000003', 'https://example.test/d', 'ready')$q$, '23514');
select test.err('failed document must carry an error_code', $q$insert into public.knowledge_documents (source_id, source_url, processing_status) values ('e0000000-0000-0000-0000-000000000003', 'https://example.test/d', 'failed')$q$, '23514');
select test.err('error_code must be a short machine code (no free text / URLs / content)', $q$insert into public.knowledge_documents (source_id, source_url, processing_status, error_code) values ('e0000000-0000-0000-0000-000000000003', 'https://example.test/d', 'failed', 'Timeout at https://secret/x?key=1')$q$, '23514');
select test.err('unknown processing_status rejected', $q$insert into public.knowledge_documents (source_id, source_url, processing_status) values ('e0000000-0000-0000-0000-000000000003', 'https://example.test/d', 'done')$q$, '23514');
select test.err('non-http source_url rejected', $q$insert into public.knowledge_documents (source_id, source_url) values ('e0000000-0000-0000-0000-000000000003', 'javascript:alert(1)')$q$, '23514');
select test.err('one document per source (unique)', $q$insert into public.knowledge_documents (source_id, source_url) values ('e0000000-0000-0000-0000-000000000001', 'https://example.test/a')$q$, '23505');
select test.err('duplicate (document, chunk_index) rejected', format($q$insert into public.knowledge_chunks (knowledge_document_id, chunk_index, content, embedding, content_hash) values ('f1000000-0000-0000-0000-000000000001', 0, 'dup', %L::extensions.vector, 'x')$q$, test.vec(0)), '23505');
select test.check('embedding with the wrong dimension is rejected', test.run($q$insert into public.knowledge_chunks (knowledge_document_id, chunk_index, content, embedding, content_hash) values ('f1000000-0000-0000-0000-000000000001', 50, 'x', '[1,2,3]'::extensions.vector, 'x')$q$) like 'err:%');
select test.err('empty chunk content rejected', format($q$insert into public.knowledge_chunks (knowledge_document_id, chunk_index, content, embedding, content_hash) values ('f1000000-0000-0000-0000-000000000001', 51, '', %L::extensions.vector, 'x')$q$, test.vec(0)), '23514');
select test.err('chunk of a missing document rejected (FK)', format($q$insert into public.knowledge_chunks (knowledge_document_id, chunk_index, content, embedding, content_hash) values (gen_random_uuid(), 0, 'x', %L::extensions.vector, 'x')$q$, test.vec(0)), '23503');

-- cascade + existing public behaviour unchanged
delete from public.scholarship_sources where id = 'e0000000-0000-0000-0000-0000000000a1';
select test.check('deleting a source cascades to its knowledge document and chunks',
  not exists (select 1 from public.knowledge_documents where id = 'f1000000-0000-0000-0000-000000000002') and not exists (select 1 from public.knowledge_chunks where content = 'Unverified source chunk'));
select test.as(null, 'anon');
select test.allow('Module 11 did not change public access: anon still reads active scholarships', $q$select 1 from public.scholarships where id = 'd0000000-0000-0000-0000-000000000001'$q$);
select test.deny('Module 11 did not change public access: anon still cannot read draft scholarships', $q$select 1 from public.scholarships where id = 'd0000000-0000-0000-0000-000000000002'$q$);
select test.as('11111111-1111-1111-1111-111111111111', 'authenticated');
select test.allow('Module 11 did not change public access: student still reads the active source', $q$select 1 from public.scholarship_sources where id = 'e0000000-0000-0000-0000-000000000001'$q$);
select test.as_owner();

\o
select case when pass then 'PASS  ' else 'FAIL  ' end || name || case when pass then '' else '   -> ' || coalesce(detail, '') end
  from test.results order by n;
select 'SUMMARY total: ' || count(*) || ' PASSED: ' || count(*) filter (where pass) || ' FAILED: ' || count(*) filter (where not pass) from test.results;
rollback;
