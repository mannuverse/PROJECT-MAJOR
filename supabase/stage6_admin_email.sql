-- Stage 6: keep the profile email available for the read-only admin directory.
-- Apply this once in the Supabase SQL Editor using the trusted project owner role.

alter table public.profiles
  add column if not exists email text not null default '';

update public.profiles as profile
set email = coalesce(auth_user.email, '')
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.email is distinct from coalesce(auth_user.email, '');

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    pg_catalog.left(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

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

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.sync_auth_user_email() from public, anon, authenticated;
