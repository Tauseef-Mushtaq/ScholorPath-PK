-- Module 13 (ADR-035): preparation roadmaps for the agentic assistant.
-- A roadmap belongs to exactly one application (the student's per-scholarship workspace row) and is
-- reachable only by that application's owner. Same ownership rule as application_tasks. No admin policy is added here.

create table public.application_roadmaps (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  title          text not null constraint application_roadmaps_title_len check (char_length(title) between 3 and 140),
  summary        text constraint application_roadmaps_summary_len check (summary is null or char_length(summary) <= 600),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger application_roadmaps_set_updated_at before update on public.application_roadmaps
  for each row execute function public.set_updated_at();

create table public.application_roadmap_steps (
  id          uuid primary key default gen_random_uuid(),
  roadmap_id  uuid not null references public.application_roadmaps (id) on delete cascade,
  position    integer not null constraint application_roadmap_steps_position_range check (position between 1 and 50),
  title       text not null constraint application_roadmap_steps_title_len check (char_length(title) between 1 and 140),
  description text constraint application_roadmap_steps_description_len check (description is null or char_length(description) <= 400),
  target_date date,
  created_at  timestamptz not null default now(),
  constraint application_roadmap_steps_position_unique unique (roadmap_id, position)
);

create or replace function public.owns_roadmap(p_roadmap_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.application_roadmaps r
    join public.applications a on a.id = r.application_id
    where r.id = p_roadmap_id and a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.owns_roadmap(uuid) from public, anon;
grant execute on function public.owns_roadmap(uuid) to authenticated, service_role;

alter table public.application_roadmaps      enable row level security;
alter table public.application_roadmap_steps enable row level security;

revoke all on table public.application_roadmaps, public.application_roadmap_steps from anon, authenticated;
grant select, delete on public.application_roadmaps, public.application_roadmap_steps to authenticated;
grant insert (application_id, title, summary) on public.application_roadmaps to authenticated;
grant update (title, summary) on public.application_roadmaps to authenticated;
grant insert (roadmap_id, position, title, description, target_date) on public.application_roadmap_steps to authenticated;
grant update (position, title, description, target_date) on public.application_roadmap_steps to authenticated;

create policy application_roadmaps_select_own on public.application_roadmaps for select to authenticated
  using (public.owns_application(application_id));
create policy application_roadmaps_insert_own on public.application_roadmaps for insert to authenticated
  with check (public.owns_application(application_id));
create policy application_roadmaps_update_own on public.application_roadmaps for update to authenticated
  using (public.owns_application(application_id)) with check (public.owns_application(application_id));
create policy application_roadmaps_delete_own on public.application_roadmaps for delete to authenticated
  using (public.owns_application(application_id));

create policy application_roadmap_steps_select_own on public.application_roadmap_steps for select to authenticated
  using (public.owns_roadmap(roadmap_id));
create policy application_roadmap_steps_insert_own on public.application_roadmap_steps for insert to authenticated
  with check (public.owns_roadmap(roadmap_id));
create policy application_roadmap_steps_update_own on public.application_roadmap_steps for update to authenticated
  using (public.owns_roadmap(roadmap_id)) with check (public.owns_roadmap(roadmap_id));
create policy application_roadmap_steps_delete_own on public.application_roadmap_steps for delete to authenticated
  using (public.owns_roadmap(roadmap_id));
