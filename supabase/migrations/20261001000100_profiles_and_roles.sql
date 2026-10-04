-- Module 03 / 1 of 4 — Identity: profiles, permanent role architecture, audit log.
-- Supersedes the temporary app_metadata role source from Module 02 (ADR-015).
--
-- Role architecture (docs/DECISIONS.md ADR-018/019):
--   * public.profiles.role is the single source of truth.
--   * Clients (anon/authenticated) can NEVER write role (no column grant + trigger guard).
--   * New users are always created as 'student' by a database trigger; no client input
--     (including user_metadata) is read.
--   * Role changes happen only through public.set_user_role(), executable by service_role only
--     (server-side), which also writes public.admin_actions.

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  role          text not null default 'student'
                  constraint profiles_role_check check (role in ('student', 'mentor', 'admin')),
  full_name     text constraint profiles_full_name_len check (char_length(full_name) <= 200),
  nationality   text constraint profiles_nationality_len check (char_length(nationality) <= 100),
  city          text constraint profiles_city_len check (char_length(city) <= 100),
  date_of_birth date,  -- only if genuinely required (docs/DATABASE.md)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Defense in depth: even if a future migration accidentally grants UPDATE on these columns to a
-- client role, clients still cannot change identity/role. (current_user is the invoking role;
-- SECURITY DEFINER functions run as their owner, so set_user_role() is allowed through.)
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.role is distinct from old.role
          or new.user_id is distinct from old.user_id
          or new.id is distinct from old.id) then
    raise exception 'profiles.id, user_id and role cannot be changed by clients'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- Automatic profile creation for every new Auth user
-- ---------------------------------------------------------------------------
-- The role is hard-coded to 'student'. NEW.raw_user_meta_data / raw_app_meta_data are
-- deliberately never read here, so signup input cannot influence the role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'student')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill for users created before this migration (Module 02 era).
-- Preserves roles an operator already granted via auth.users.raw_app_meta_data
-- (service-role/dashboard-only, trusted). raw_user_meta_data is NEVER read.
-- Unknown values become 'student'.
-- ---------------------------------------------------------------------------
insert into public.profiles (user_id, role)
select u.id,
       case when u.raw_app_meta_data ->> 'role' in ('student', 'mentor', 'admin')
            then u.raw_app_meta_data ->> 'role'
            else 'student' end
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Role helpers used by RLS policies (SECURITY DEFINER so policies never recurse into profiles RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.user_id = (select auth.uid())), false);
$$;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin_actions: append-only audit log (docs/SECURITY.md "Audit")
-- ---------------------------------------------------------------------------
create table public.admin_actions (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,  -- null = operator/SQL/service action
  action_type   text not null,
  target_type   text,
  target_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index admin_actions_admin_user_id_idx on public.admin_actions (admin_user_id);
create index admin_actions_created_at_idx on public.admin_actions (created_at desc);

-- ---------------------------------------------------------------------------
-- set_user_role: the ONLY supported way to change a role (server-side / service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(
  p_target_user  uuid,
  p_new_role     text,
  p_acting_admin uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_new_role is null or p_new_role not in ('student', 'mentor', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  if p_acting_admin is not null
     and not exists (select 1 from public.profiles a where a.user_id = p_acting_admin and a.role = 'admin') then
    raise exception 'acting user is not an admin' using errcode = '42501';
  end if;

  select p.role into v_old from public.profiles p where p.user_id = p_target_user for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  update public.profiles set role = p_new_role where user_id = p_target_user;

  insert into public.admin_actions (admin_user_id, action_type, target_type, target_id, metadata)
  values (p_acting_admin, 'set_user_role', 'user', p_target_user,
          jsonb_build_object('from', v_old, 'to', p_new_role));
end;
$$;

revoke all on function public.set_user_role(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, text, uuid) to service_role;
