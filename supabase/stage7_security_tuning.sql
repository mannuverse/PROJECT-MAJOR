-- Internal access-check functions stay outside Supabase's exposed public schema.
-- Apply after stage7_team_features.sql. This migration preserves all user data.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_access_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id and (
      t.user_id = (select auth.uid()) or t.assignee_id = (select auth.uid()) or
      (t.project_id is not null and private.is_project_member(t.project_id))
    )
  );
$$;

revoke all on function private.is_project_member(uuid) from public, anon;
revoke all on function private.can_access_task(uuid) from public, anon;
grant execute on function private.is_project_member(uuid) to authenticated;
grant execute on function private.can_access_task(uuid) to authenticated;

create or replace function public.list_project_members(p_project_id uuid)
returns table(user_id uuid, full_name text, email text, member_role text, capacity_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_project_member(p_project_id) then
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

create or replace function public.create_task_comment(p_task_id uuid, p_body text, p_mentioned_users uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_comment_id uuid; v_task_title text; v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.can_access_task(p_task_id) then raise exception 'Task not found' using errcode = '42501'; end if;
  if char_length(btrim(p_body)) not between 1 and 4000 then raise exception 'Comment must contain 1 to 4000 characters'; end if;
  insert into public.task_comments(task_id, author_id, body)
  values(p_task_id, v_actor, btrim(p_body)) returning id into v_comment_id;
  select title into v_task_title from public.tasks where id = p_task_id;
  insert into public.notifications(user_id, task_id, actor_id, notification_type, message)
  select distinct mentioned_id, p_task_id, v_actor, 'mention',
    pg_catalog.left((select full_name from public.profiles where id = v_actor) || ' mentioned you on “' || v_task_title || '”', 500)
  from pg_catalog.unnest(coalesce(p_mentioned_users, '{}')) as mentioned_id
  where mentioned_id <> v_actor and private.is_project_member(
    (select project_id from public.tasks where id = p_task_id)
  ) and exists (
    select 1 from public.project_members pm
    where pm.user_id = mentioned_id and pm.project_id = (select project_id from public.tasks where id = p_task_id)
  );
  return v_comment_id;
end;
$$;
revoke all on function public.list_project_members(uuid) from public, anon;
grant execute on function public.list_project_members(uuid) to authenticated;
revoke all on function public.create_task_comment(uuid, text, uuid[]) from public, anon;
grant execute on function public.create_task_comment(uuid, text, uuid[]) to authenticated;

drop policy if exists projects_read_member on public.projects;
create policy projects_read_member on public.projects for select to authenticated
using (owner_id = (select auth.uid()) or (select private.is_project_member(id)));
drop policy if exists project_members_read_member on public.project_members;
create policy project_members_read_member on public.project_members for select to authenticated
using ((select private.is_project_member(project_id)));

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks for select to authenticated
using (user_id = (select auth.uid()) or assignee_id = (select auth.uid()) or
  (project_id is not null and (select private.is_project_member(project_id))));
drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks for insert to authenticated
with check (user_id = (select auth.uid()) and
  (project_id is null or (select private.is_project_member(project_id))) and
  (assignee_id is null or project_id is not null and exists (
    select 1 from public.project_members pm where pm.project_id = project_id and pm.user_id = assignee_id
  )));
drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks for update to authenticated
using (user_id = (select auth.uid()) or (project_id is not null and (select private.is_project_member(project_id))))
with check ((user_id = (select auth.uid()) or (project_id is not null and (select private.is_project_member(project_id)))) and
  (assignee_id is null or project_id is not null and exists (
    select 1 from public.project_members pm where pm.project_id = project_id and pm.user_id = assignee_id
  )));
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks for delete to authenticated
using (user_id = (select auth.uid()) or (project_id is not null and (select private.is_project_member(project_id))));

drop policy if exists dependencies_read_task_member on public.task_dependencies;
create policy dependencies_read_task_member on public.task_dependencies for select to authenticated
using ((select private.can_access_task(task_id)) and (select private.can_access_task(depends_on_task_id)));
drop policy if exists dependencies_insert_task_member on public.task_dependencies;
create policy dependencies_insert_task_member on public.task_dependencies for insert to authenticated
with check ((select private.can_access_task(task_id)) and (select private.can_access_task(depends_on_task_id)));
drop policy if exists dependencies_delete_task_member on public.task_dependencies;
create policy dependencies_delete_task_member on public.task_dependencies for delete to authenticated
using ((select private.can_access_task(task_id)) and (select private.can_access_task(depends_on_task_id)));
drop policy if exists comments_read_task_member on public.task_comments;
create policy comments_read_task_member on public.task_comments for select to authenticated
using ((select private.can_access_task(task_id)));
drop policy if exists comments_insert_own on public.task_comments;
create policy comments_insert_own on public.task_comments for insert to authenticated
with check (author_id = (select auth.uid()) and (select private.can_access_task(task_id)));
drop policy if exists activity_read_task_member on public.task_activity;
create policy activity_read_task_member on public.task_activity for select to authenticated
using ((select private.can_access_task(task_id)));
drop policy if exists activity_insert_own on public.task_activity;
create policy activity_insert_own on public.task_activity for insert to authenticated
with check (actor_id = (select auth.uid()) and (select private.can_access_task(task_id)));

drop function if exists public.is_project_member(uuid);
drop function if exists public.can_access_task(uuid);

create index if not exists notifications_actor_idx on public.notifications(actor_id);
create index if not exists notifications_task_idx on public.notifications(task_id);
create index if not exists task_activity_actor_idx on public.task_activity(actor_id);
create index if not exists task_comments_author_idx on public.task_comments(author_id);
create index if not exists task_dependencies_creator_idx on public.task_dependencies(created_by);
create index if not exists task_dependencies_depends_on_idx on public.task_dependencies(depends_on_task_id);

