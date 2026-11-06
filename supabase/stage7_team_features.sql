-- FlowDesk Stage 7: projects, shared tasks, collaboration, capacity, and saved views.
-- Apply once in Supabase SQL Editor as the project owner before deploying Stage 7 code.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  color text not null default '#f78555' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'member')),
  capacity_hours numeric(5,1) not null default 40 check (capacity_hours between 0 and 168),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create or replace function public.add_project_owner_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members(project_id, user_id, member_role)
  values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists projects_add_owner_membership on public.projects;
create trigger projects_add_owner_membership after insert on public.projects
for each row execute function public.add_project_owner_membership();

create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = (select auth.uid())
  );
$$;

alter table public.tasks add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.tasks add column if not exists assignee_id uuid references public.profiles(id) on delete set null;
alter table public.tasks add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;
alter table public.tasks add column if not exists effort_hours numeric(6,1) not null default 1 check (effort_hours between 0 and 1000);
alter table public.tasks add column if not exists blocked_reason text not null default '' check (char_length(blocked_reason) <= 500);

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'blocked', 'done'));
alter table public.tasks drop constraint if exists tasks_parent_not_self_check;
alter table public.tasks add constraint tasks_parent_not_self_check
  check (parent_task_id is null or parent_task_id <> id);

create index if not exists projects_owner_created_idx on public.projects(owner_id, created_at desc);
create index if not exists project_members_user_idx on public.project_members(user_id, project_id);
create index if not exists tasks_project_status_idx on public.tasks(project_id, status);
create index if not exists tasks_assignee_status_idx on public.tasks(assignee_id, status);
create index if not exists tasks_parent_idx on public.tasks(parent_task_id);

create table if not exists public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  constraint task_dependency_not_self_check check (task_id <> depends_on_task_id)
);

create or replace function public.prevent_task_dependency_cycle()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_cycle boolean;
begin
  with recursive chain(task_id) as (
    select new.depends_on_task_id
    union
    select dependency.depends_on_task_id
    from public.task_dependencies dependency
    join chain on chain.task_id = dependency.task_id
  )
  select exists(select 1 from chain where task_id = new.task_id) into v_cycle;
  if v_cycle then raise exception 'This dependency would create a cycle'; end if;
  return new;
end;
$$;
drop trigger if exists prevent_task_dependency_cycle on public.task_dependencies;
create trigger prevent_task_dependency_cycle before insert or update on public.task_dependencies
for each row execute function public.prevent_task_dependency_cycle();

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_time_idx on public.task_comments(task_id, created_at);

create table if not exists public.task_activity (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists task_activity_task_time_idx on public.task_activity(task_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (notification_type in ('assignment', 'mention')),
  message text not null check (char_length(message) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_time_idx on public.notifications(user_id, created_at desc);

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create or replace function public.list_project_members(p_project_id uuid)
returns table(user_id uuid, full_name text, email text, member_role text, capacity_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_project_member(p_project_id) then
    raise exception 'You are not a member of this project' using errcode = '42501';
  end if;
  return query
    select pm.user_id, p.full_name, p.email, pm.member_role, pm.capacity_hours
    from public.project_members pm
    join public.profiles p on p.id = pm.user_id
    where pm.project_id = p_project_id
    order by case when pm.member_role = 'owner' then 0 else 1 end, p.full_name;
end;
$$;

create or replace function public.add_project_member_by_email(p_project_id uuid, p_email text)
returns table(user_id uuid, full_name text, email text, member_role text, capacity_hours numeric)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the project owner can add members' using errcode = '42501';
  end if;
  select p.id into v_user_id from public.profiles p
  where pg_catalog.lower(p.email) = pg_catalog.lower(pg_catalog.btrim(p_email)) limit 1;
  if v_user_id is null then
    raise exception 'No FlowDesk account uses that email address';
  end if;
  insert into public.project_members(project_id, user_id)
  values (p_project_id, v_user_id) on conflict (project_id, user_id) do nothing;
  return query select * from public.list_project_members(p_project_id) m where m.user_id = v_user_id;
end;
$$;

create or replace function public.can_access_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id and (
      t.user_id = (select auth.uid()) or t.assignee_id = (select auth.uid()) or
      (t.project_id is not null and public.is_project_member(t.project_id))
    )
  );
$$;

create or replace function public.create_task_comment(p_task_id uuid, p_body text, p_mentioned_users uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_comment_id uuid; v_task_title text; v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_access_task(p_task_id) then raise exception 'Task not found' using errcode = '42501'; end if;
  if char_length(btrim(p_body)) not between 1 and 4000 then raise exception 'Comment must contain 1 to 4000 characters'; end if;
  insert into public.task_comments(task_id, author_id, body)
  values(p_task_id, v_actor, btrim(p_body)) returning id into v_comment_id;
  select title into v_task_title from public.tasks where id = p_task_id;
  insert into public.notifications(user_id, task_id, actor_id, notification_type, message)
  select distinct mentioned_id, p_task_id, v_actor, 'mention',
    pg_catalog.left((select full_name from public.profiles where id = v_actor) || ' mentioned you on “' || v_task_title || '”', 500)
  from pg_catalog.unnest(coalesce(p_mentioned_users, '{}')) as mentioned_id
  where mentioned_id <> v_actor and public.is_project_member(
    (select project_id from public.tasks where id = p_task_id)
  ) and exists (
    select 1 from public.project_members pm
    where pm.user_id = mentioned_id and pm.project_id = (select project_id from public.tasks where id = p_task_id)
  );
  return v_comment_id;
end;
$$;

create or replace function public.log_task_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_details jsonb := '{}'::jsonb; v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'created'; v_details := jsonb_build_object('title', new.title);
    if new.assignee_id is not null and new.assignee_id <> v_actor then
      insert into public.notifications(user_id, task_id, actor_id, notification_type, message)
      values(new.assignee_id, new.id, v_actor, 'assignment', 'A task was assigned to you: ' || new.title);
    end if;
    insert into public.task_activity(task_id, actor_id, event_type, details)
    values(new.id, v_actor, v_event, v_details);
    return new;
  end if;
  if old.status is distinct from new.status then
    insert into public.task_activity(task_id, actor_id, event_type, details)
    values(new.id, v_actor, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if old.assignee_id is distinct from new.assignee_id and new.assignee_id is not null and new.assignee_id <> v_actor then
    insert into public.notifications(user_id, task_id, actor_id, notification_type, message)
    values(new.assignee_id, new.id, v_actor, 'assignment', 'A task was assigned to you: ' || new.title);
    insert into public.task_activity(task_id, actor_id, event_type, details)
    values(new.id, v_actor, 'assigned', jsonb_build_object('assignee_id', new.assignee_id));
  end if;
  if old.title is distinct from new.title or old.priority is distinct from new.priority or old.due_date is distinct from new.due_date then
    insert into public.task_activity(task_id, actor_id, event_type, details)
    values(new.id, v_actor, 'updated', jsonb_build_object('title', new.title, 'priority', new.priority, 'due_date', new.due_date));
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_log_activity on public.tasks;
create trigger tasks_log_activity after insert or update on public.tasks
for each row execute function public.log_task_activity();

create or replace function public.log_comment_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_activity(task_id, actor_id, event_type, details)
  values(new.task_id, new.author_id, 'commented', jsonb_build_object('comment_id', new.id));
  return new;
end;
$$;
drop trigger if exists comments_log_activity on public.task_comments;
create trigger comments_log_activity after insert on public.task_comments
for each row execute function public.log_comment_activity();

-- Limit browser access to the rows and operations required by the app.
revoke all on public.projects, public.project_members, public.task_dependencies,
  public.task_comments, public.task_activity, public.notifications, public.saved_views
  from public, anon, authenticated;
grant select, insert, update on public.projects to authenticated;
grant select on public.project_members to authenticated;
grant update (capacity_hours) on public.project_members to authenticated;
grant select, insert, delete on public.task_dependencies to authenticated;
grant select on public.task_comments, public.task_activity, public.notifications, public.saved_views to authenticated;
grant insert, delete on public.saved_views to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert on public.task_comments to authenticated;

revoke all on function public.add_project_owner_membership() from public, anon, authenticated;
revoke all on function public.log_task_activity() from public, anon, authenticated;
revoke all on function public.log_comment_activity() from public, anon, authenticated;
revoke all on function public.prevent_task_dependency_cycle() from public, anon, authenticated;
revoke all on function public.is_project_member(uuid) from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated;
revoke all on function public.can_access_task(uuid) from public, anon;
grant execute on function public.can_access_task(uuid) to authenticated;
revoke all on function public.list_project_members(uuid) from public, anon;
grant execute on function public.list_project_members(uuid) to authenticated;
revoke all on function public.add_project_member_by_email(uuid, text) from public, anon;
grant execute on function public.add_project_member_by_email(uuid, text) to authenticated;
revoke all on function public.create_task_comment(uuid, text, uuid[]) from public, anon;
grant execute on function public.create_task_comment(uuid, text, uuid[]) to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;
alter table public.notifications enable row level security;
alter table public.saved_views enable row level security;

drop policy if exists projects_read_member on public.projects;
create policy projects_read_member on public.projects for select to authenticated
using (owner_id = (select auth.uid()) or (select public.is_project_member(id)));
drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner on public.projects for insert to authenticated
with check (owner_id = (select auth.uid()));
drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner on public.projects for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists project_members_read_member on public.project_members;
create policy project_members_read_member on public.project_members for select to authenticated
using ((select public.is_project_member(project_id)));
drop policy if exists project_members_update_own_capacity on public.project_members;
create policy project_members_update_own_capacity on public.project_members for update to authenticated
using (user_id = (select auth.uid()) or exists (
  select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
)) with check (user_id = (select auth.uid()) or exists (
  select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
));

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks for select to authenticated
using (user_id = (select auth.uid()) or assignee_id = (select auth.uid()) or
  (project_id is not null and (select public.is_project_member(project_id))));
drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks for insert to authenticated
with check (user_id = (select auth.uid()) and
  (project_id is null or (select public.is_project_member(project_id))) and
  (assignee_id is null or project_id is not null and exists (
    select 1 from public.project_members pm where pm.project_id = project_id and pm.user_id = assignee_id
  )));
drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks for update to authenticated
using (user_id = (select auth.uid()) or (project_id is not null and (select public.is_project_member(project_id))))
with check ((user_id = (select auth.uid()) or (project_id is not null and (select public.is_project_member(project_id)))) and
  (assignee_id is null or project_id is not null and exists (
    select 1 from public.project_members pm where pm.project_id = project_id and pm.user_id = assignee_id
  )));
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks for delete to authenticated
using (user_id = (select auth.uid()) or (project_id is not null and (select public.is_project_member(project_id))));

drop policy if exists dependencies_read_task_member on public.task_dependencies;
create policy dependencies_read_task_member on public.task_dependencies for select to authenticated
using ((select public.can_access_task(task_id)) and (select public.can_access_task(depends_on_task_id)));
drop policy if exists dependencies_insert_task_member on public.task_dependencies;
create policy dependencies_insert_task_member on public.task_dependencies for insert to authenticated
with check ((select public.can_access_task(task_id)) and (select public.can_access_task(depends_on_task_id)));
drop policy if exists dependencies_delete_task_member on public.task_dependencies;
create policy dependencies_delete_task_member on public.task_dependencies for delete to authenticated
using ((select public.can_access_task(task_id)) and (select public.can_access_task(depends_on_task_id)));
drop policy if exists comments_read_task_member on public.task_comments;
create policy comments_read_task_member on public.task_comments for select to authenticated
using ((select public.can_access_task(task_id)));
drop policy if exists comments_insert_own on public.task_comments;
create policy comments_insert_own on public.task_comments for insert to authenticated
with check (author_id = (select auth.uid()) and (select public.can_access_task(task_id)));
drop policy if exists activity_read_task_member on public.task_activity;
create policy activity_read_task_member on public.task_activity for select to authenticated
using ((select public.can_access_task(task_id)));
drop policy if exists activity_insert_own on public.task_activity;
create policy activity_insert_own on public.task_activity for insert to authenticated
with check (actor_id = (select auth.uid()) and (select public.can_access_task(task_id)));
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own on public.notifications for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists saved_views_read_own on public.saved_views;
create policy saved_views_read_own on public.saved_views for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists saved_views_insert_own on public.saved_views;
create policy saved_views_insert_own on public.saved_views for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists saved_views_delete_own on public.saved_views;
create policy saved_views_delete_own on public.saved_views for delete to authenticated
using (user_id = (select auth.uid()));

-- Teammates may see only the basic profiles of people sharing a project with them.
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()) or exists (
  select 1 from public.project_members mine
  join public.project_members theirs on theirs.project_id = mine.project_id
  where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
));


