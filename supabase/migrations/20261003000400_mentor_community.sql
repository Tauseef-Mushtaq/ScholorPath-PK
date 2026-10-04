-- Module 17 — Mentor Community: stories, timelines, Q&A + admin verification grants.
-- Builds on public.mentors (Module 03). verification_status remains non-writable by non-admins.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.owns_mentor(p_mentor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mentors m
    where m.id = p_mentor_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_verified_mentor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mentors m
    where m.user_id = (select auth.uid()) and m.verification_status = 'verified'
  );
$$;

revoke all on function public.owns_mentor(uuid) from public, anon;
revoke all on function public.is_verified_mentor() from public, anon;
grant execute on function public.owns_mentor(uuid) to authenticated, service_role;
grant execute on function public.is_verified_mentor() to authenticated, service_role;

-- Admin may set verification_status / verified_at (clients still cannot via non-admin policies).
grant update (verification_status, verified_at) on public.mentors to authenticated;

drop policy if exists mentors_update_own on public.mentors;
create policy mentors_update_own on public.mentors for update to authenticated
  using (user_id = (select auth.uid()) and verification_status = 'pending')
  with check (user_id = (select auth.uid()) and verification_status = 'pending');

create policy mentors_update_admin on public.mentors for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- mentor_stories
-- ---------------------------------------------------------------------------
create table public.mentor_stories (
  id            uuid primary key default gen_random_uuid(),
  mentor_id     uuid not null references public.mentors (id) on delete cascade,
  title         text not null,
  body          text not null,
  status        text not null default 'draft'
                  constraint mentor_stories_status_check
                  check (status in ('draft', 'published', 'archived')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint mentor_stories_title_len check (char_length(title) between 1 and 200),
  constraint mentor_stories_body_len check (char_length(body) between 1 and 50000),
  constraint mentor_stories_published_consistent check (
    (status = 'published' and published_at is not null) or (status <> 'published')
  )
);

create index mentor_stories_mentor_id_idx on public.mentor_stories (mentor_id);
create index mentor_stories_status_idx on public.mentor_stories (status);

create or replace function public.set_mentor_stories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger mentor_stories_set_updated_at
  before update on public.mentor_stories
  for each row execute function public.set_mentor_stories_updated_at();

alter table public.mentor_stories enable row level security;
revoke all on table public.mentor_stories from public, anon, authenticated;
grant select on public.mentor_stories to anon, authenticated;
grant insert (mentor_id, title, body, status, published_at) on public.mentor_stories to authenticated;
grant update (title, body, status, published_at) on public.mentor_stories to authenticated;
grant delete on public.mentor_stories to authenticated;

create policy mentor_stories_select_published on public.mentor_stories
  for select to anon, authenticated
  using (status = 'published');

create policy mentor_stories_select_own on public.mentor_stories
  for select to authenticated
  using (public.owns_mentor(mentor_id));

create policy mentor_stories_select_admin on public.mentor_stories
  for select to authenticated
  using (public.is_admin());

create policy mentor_stories_insert_own on public.mentor_stories
  for insert to authenticated
  with check (
    public.owns_mentor(mentor_id)
    and public.is_verified_mentor()
  );

create policy mentor_stories_update_own on public.mentor_stories
  for update to authenticated
  using (public.owns_mentor(mentor_id) and public.is_verified_mentor())
  with check (public.owns_mentor(mentor_id));

create policy mentor_stories_delete_own on public.mentor_stories
  for delete to authenticated
  using (public.owns_mentor(mentor_id));

create policy mentor_stories_admin_all on public.mentor_stories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- mentor_timelines
-- ---------------------------------------------------------------------------
create table public.mentor_timelines (
  id              uuid primary key default gen_random_uuid(),
  mentor_id       uuid not null references public.mentors (id) on delete cascade,
  title           text not null,
  date_or_period  text,
  description     text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  constraint mentor_timelines_title_len check (char_length(title) between 1 and 200),
  constraint mentor_timelines_period_len check (date_or_period is null or char_length(date_or_period) <= 100),
  constraint mentor_timelines_desc_len check (description is null or char_length(description) <= 4000)
);

create index mentor_timelines_mentor_id_idx on public.mentor_timelines (mentor_id);

alter table public.mentor_timelines enable row level security;
revoke all on table public.mentor_timelines from public, anon, authenticated;
grant select on public.mentor_timelines to anon, authenticated;
grant insert (mentor_id, title, date_or_period, description, sort_order) on public.mentor_timelines to authenticated;
grant update (title, date_or_period, description, sort_order) on public.mentor_timelines to authenticated;
grant delete on public.mentor_timelines to authenticated;

-- Timeline visible when mentor is verified (public personal experience).
create policy mentor_timelines_select_verified on public.mentor_timelines
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.mentors m
      where m.id = mentor_id and m.verification_status = 'verified'
    )
  );

create policy mentor_timelines_select_own on public.mentor_timelines
  for select to authenticated
  using (public.owns_mentor(mentor_id));

create policy mentor_timelines_insert_own on public.mentor_timelines
  for insert to authenticated
  with check (public.owns_mentor(mentor_id) and public.is_verified_mentor());

create policy mentor_timelines_update_own on public.mentor_timelines
  for update to authenticated
  using (public.owns_mentor(mentor_id) and public.is_verified_mentor())
  with check (public.owns_mentor(mentor_id));

create policy mentor_timelines_delete_own on public.mentor_timelines
  for delete to authenticated
  using (public.owns_mentor(mentor_id));

create policy mentor_timelines_admin on public.mentor_timelines
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- mentor_questions (students ask; labeled personal-experience answers)
-- ---------------------------------------------------------------------------
create table public.mentor_questions (
  id              uuid primary key default gen_random_uuid(),
  asker_user_id   uuid not null references auth.users (id) on delete cascade,
  mentor_id       uuid references public.mentors (id) on delete set null,
  title           text not null,
  body            text not null,
  status          text not null default 'open'
                    constraint mentor_questions_status_check
                    check (status in ('open', 'answered', 'closed')),
  created_at      timestamptz not null default now(),
  constraint mentor_questions_title_len check (char_length(title) between 1 and 200),
  constraint mentor_questions_body_len check (char_length(body) between 1 and 4000)
);

create index mentor_questions_mentor_id_idx on public.mentor_questions (mentor_id);
create index mentor_questions_asker_idx on public.mentor_questions (asker_user_id);
create index mentor_questions_status_idx on public.mentor_questions (status);

alter table public.mentor_questions enable row level security;
revoke all on table public.mentor_questions from public, anon, authenticated;
grant select on public.mentor_questions to anon, authenticated;
grant insert (asker_user_id, mentor_id, title, body, status) on public.mentor_questions to authenticated;
grant update (status) on public.mentor_questions to authenticated;
grant delete on public.mentor_questions to authenticated;

-- Open questions are publicly readable (community Q&A).
create policy mentor_questions_select_public on public.mentor_questions
  for select to anon, authenticated
  using (true);

create policy mentor_questions_insert_own on public.mentor_questions
  for insert to authenticated
  with check (asker_user_id = (select auth.uid()));

create policy mentor_questions_delete_own on public.mentor_questions
  for delete to authenticated
  using (asker_user_id = (select auth.uid()));

create policy mentor_questions_update_admin on public.mentor_questions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- mentor_answers
-- ---------------------------------------------------------------------------
create table public.mentor_answers (
  id            uuid primary key default gen_random_uuid(),
  mentor_id     uuid not null references public.mentors (id) on delete cascade,
  question_id   uuid references public.mentor_questions (id) on delete cascade,
  question      text,
  answer        text not null,
  status        text not null default 'published'
                  constraint mentor_answers_status_check
                  check (status in ('draft', 'published', 'archived')),
  created_at    timestamptz not null default now(),
  constraint mentor_answers_answer_len check (char_length(answer) between 1 and 20000),
  constraint mentor_answers_question_len check (question is null or char_length(question) <= 2000)
);

create index mentor_answers_mentor_id_idx on public.mentor_answers (mentor_id);
create index mentor_answers_question_id_idx on public.mentor_answers (question_id);

alter table public.mentor_answers enable row level security;
revoke all on table public.mentor_answers from public, anon, authenticated;
grant select on public.mentor_answers to anon, authenticated;
grant insert (mentor_id, question_id, question, answer, status) on public.mentor_answers to authenticated;
grant update (question, answer, status) on public.mentor_answers to authenticated;
grant delete on public.mentor_answers to authenticated;

create policy mentor_answers_select_published on public.mentor_answers
  for select to anon, authenticated
  using (status = 'published');

create policy mentor_answers_select_own on public.mentor_answers
  for select to authenticated
  using (public.owns_mentor(mentor_id));

create policy mentor_answers_insert_own on public.mentor_answers
  for insert to authenticated
  with check (public.owns_mentor(mentor_id) and public.is_verified_mentor());

create policy mentor_answers_update_own on public.mentor_answers
  for update to authenticated
  using (public.owns_mentor(mentor_id) and public.is_verified_mentor())
  with check (public.owns_mentor(mentor_id));

create policy mentor_answers_delete_own on public.mentor_answers
  for delete to authenticated
  using (public.owns_mentor(mentor_id));

create policy mentor_answers_admin on public.mentor_answers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
