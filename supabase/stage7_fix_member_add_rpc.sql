-- Fix PL/pgSQL name ambiguity in the project member add RPC response query.
create or replace function public.add_project_member_by_email(p_project_id uuid, p_email text)
returns table(user_id uuid, full_name text, email text, member_role text, capacity_hours numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not exists (
    select 1
    from public.projects as project_row
    where project_row.id = p_project_id
      and project_row.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the project owner can add members' using errcode = '42501';
  end if;

  select profile_row.id
  into v_user_id
  from public.profiles as profile_row
  where pg_catalog.lower(profile_row.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No FlowDesk account uses that email address';
  end if;

  insert into public.project_members as member_row(project_id, user_id)
  values (p_project_id, v_user_id)
  on conflict (project_id, user_id) do nothing;

  return query
    select member_list.user_id, member_list.full_name, member_list.email,
           member_list.member_role, member_list.capacity_hours
    from public.list_project_members(p_project_id) as member_list
    where member_list.user_id = v_user_id;
end;
$$;
