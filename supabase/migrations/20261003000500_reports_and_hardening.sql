-- Module 18 — Community reports + admin list indexes (production hardening).

-- ---------------------------------------------------------------------------
-- reports (user-submitted moderation flags)
-- ---------------------------------------------------------------------------
create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_user_id  uuid not null references auth.users (id) on delete cascade,
  target_type       text not null
                      constraint reports_target_type_check
                      check (target_type in (
                        'mentor_story',
                        'mentor_answer',
                        'mentor_question',
                        'mentor',
                        'scholarship',
                        'user',
                        'other'
                      )),
  target_id         uuid,
  reason            text not null
                      constraint reports_reason_check
                      check (reason in (
                        'spam',
                        'misinformation',
                        'harassment',
                        'inappropriate',
                        'impersonation',
                        'other'
                      )),
  description       text,
  status            text not null default 'open'
                      constraint reports_status_check
                      check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by       uuid references auth.users (id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint reports_description_len check (description is null or char_length(description) <= 2000),
  constraint reports_resolved_consistent check (
    (status in ('resolved', 'dismissed') and resolved_at is not null)
    or (status in ('open', 'reviewing') and resolved_at is null)
  )
);

create index reports_status_idx on public.reports (status);
create index reports_created_at_idx on public.reports (created_at desc);
create index reports_reporter_idx on public.reports (reporter_user_id);

alter table public.reports enable row level security;
revoke all on table public.reports from public, anon, authenticated;

grant select on public.reports to authenticated;
grant insert (reporter_user_id, target_type, target_id, reason, description, status)
  on public.reports to authenticated;
grant update (status, resolved_by, resolved_at) on public.reports to authenticated;

-- Reporter can see own reports; admin sees all.
create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_user_id = (select auth.uid()));

create policy reports_select_admin on public.reports
  for select to authenticated
  using (public.is_admin());

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_user_id = (select auth.uid())
    and status = 'open'
  );

create policy reports_update_admin on public.reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Helpful indexes for admin dashboards (existing tables).
create index if not exists scholarships_status_updated_idx
  on public.scholarships (status, updated_at desc);

create index if not exists mentors_verification_created_idx
  on public.mentors (verification_status, created_at desc);
