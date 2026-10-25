-- FlowDesk Stage 2 schema.
-- Apply this once in the Supabase SQL Editor using the project's trusted admin role.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  category text check (category is null or char_length(category) <= 80),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz
);

create index if not exists tasks_user_status_idx
  on public.tasks (user_id, status);
create index if not exists tasks_user_due_date_idx
  on public.tasks (user_id, due_date);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  login_at timestamptz not null default pg_catalog.now(),
  logout_at timestamptz,
  last_seen_at timestamptz not null default pg_catalog.now(),
  constraint user_sessions_logout_after_login_check
    check (logout_at is null or logout_at >= login_at),
  constraint user_sessions_last_seen_after_login_check
    check (last_seen_at >= login_at)
);

create index if not exists user_sessions_user_login_idx
  on public.user_sessions (user_id, login_at desc);
create index if not exists user_sessions_last_seen_idx
  on public.user_sessions (last_seen_at desc);

-- The owner role used by SQL Editor/migrations can read profiles here without
-- recursing through the profiles RLS policy that calls this function.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only copy a display name. Never trust signup metadata for a role.
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    pg_catalog.left(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_flowdesk on auth.users;
create trigger on_auth_user_created_flowdesk
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = coalesce(new.email, '')
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated_flowdesk on auth.users;
create trigger on_auth_user_email_updated_flowdesk
  after update of email on auth.users
  for each row execute function public.sync_auth_user_email();

create or replace function public.set_task_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists set_task_updated_at on public.tasks;
create trigger set_task_updated_at
  before update on public.tasks
  for each row execute function public.set_task_updated_at();

-- Session timestamps are server-generated. Clients can create only their own
-- row, and these RPCs can update only that caller's still-open row.
create or replace function public.touch_user_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.user_sessions
  set last_seen_at = pg_catalog.now()
  where id = p_session_id
    and user_id = (select auth.uid())
    and logout_at is null;

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

create or replace function public.close_user_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.user_sessions
  set logout_at = pg_catalog.now(),
      last_seen_at = pg_catalog.now()
  where id = p_session_id
    and user_id = (select auth.uid())
    and logout_at is null;

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

-- Remove default API privileges, then grant only the operations needed by the
-- client. RLS policies below still decide which rows each operation can reach.
revoke all on table public.profiles, public.tasks, public.user_sessions
  from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

grant select, insert, update, delete on table public.tasks to authenticated;

grant select on table public.user_sessions to authenticated;
grant insert (user_id) on table public.user_sessions to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.sync_auth_user_email() from public, anon, authenticated;
revoke all on function public.set_task_updated_at() from public, anon, authenticated;

revoke all on function public.touch_user_session(uuid) from public, anon;
grant execute on function public.touch_user_session(uuid) to authenticated;
revoke all on function public.close_user_session(uuid) from public, anon;
grant execute on function public.close_user_session(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.user_sessions enable row level security;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_update_own_name on public.profiles;
create policy profiles_update_own_name
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own
  on public.tasks for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own
  on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own
  on public.tasks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own
  on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists sessions_read_self_or_admin on public.user_sessions;
create policy sessions_read_self_or_admin
  on public.user_sessions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists sessions_insert_own on public.user_sessions;
create policy sessions_insert_own
  on public.user_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));

comment on table public.user_sessions is
  'Best-effort application session history. Missing logout_at can mean the browser closed or lost connectivity.';
