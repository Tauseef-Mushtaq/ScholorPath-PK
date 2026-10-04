-- Module 15 — Application Copilot: application_drafts
-- Student-owned draft texts (SOP, essays, motivation letter, research proposal, CV, Q&A answers).
-- Identity and ownership via applications.user_id + owns_application(); no service role for client paths.

create table public.application_drafts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  draft_type text not null,
  title text,
  content text not null default '',
  version integer not null default 1,
  ai_generated boolean not null default false,
  user_approved boolean not null default false,
  prompt_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_drafts_draft_type_check check (
    draft_type in (
      'sop',
      'motivation_letter',
      'personal_statement',
      'study_plan',
      'scholarship_essay',
      'research_proposal',
      'cv',
      'application_question'
    )
  ),
  constraint application_drafts_version_positive check (version >= 1),
  constraint application_drafts_content_len check (char_length(content) <= 50000),
  constraint application_drafts_title_len check (title is null or char_length(title) <= 200),
  constraint application_drafts_prompt_summary_len check (prompt_summary is null or char_length(prompt_summary) <= 500)
);

create index application_drafts_application_id_idx on public.application_drafts (application_id);
create index application_drafts_application_type_idx on public.application_drafts (application_id, draft_type);

create or replace function public.set_application_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger application_drafts_set_updated_at
  before update on public.application_drafts
  for each row execute function public.set_application_drafts_updated_at();

alter table public.application_drafts enable row level security;

revoke all on table public.application_drafts from public, anon, authenticated;
grant select, delete on public.application_drafts to authenticated;
grant insert (application_id, draft_type, title, content, version, ai_generated, user_approved, prompt_summary)
  on public.application_drafts to authenticated;
grant update (title, content, version, ai_generated, user_approved, prompt_summary)
  on public.application_drafts to authenticated;

create policy application_drafts_select_own on public.application_drafts
  for select to authenticated
  using (public.owns_application(application_id));

create policy application_drafts_insert_own on public.application_drafts
  for insert to authenticated
  with check (public.owns_application(application_id));

create policy application_drafts_update_own on public.application_drafts
  for update to authenticated
  using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

create policy application_drafts_delete_own on public.application_drafts
  for delete to authenticated
  using (public.owns_application(application_id));
