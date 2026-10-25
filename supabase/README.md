# Supabase database setup

## Apply the schema

1. Create a Supabase project and open **SQL Editor** in its dashboard.
2. Open `supabase/schema.sql` from this repository, paste the full file into a new SQL Editor query, and run it using the trusted project owner context.
3. Confirm the three public tables have Row Level Security enabled:

   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public'
     and tablename in ('profiles', 'tasks', 'user_sessions')
   order by tablename;
   ```

4. Review the installed policies:

   ```sql
   select tablename, policyname, roles, cmd
   from pg_policies
   where schemaname = 'public'
   order by tablename, policyname;
   ```

Running these inspection queries as the project owner confirms the schema and policies are installed; it does **not** simulate a regular user's access. Test row isolation later through authenticated clients using two separate accounts.

## Stage 6 profile email migration

For a project that already applied the earlier schema, run `supabase/stage6_admin_email.sql` once in the SQL Editor as the trusted project owner. It adds and backfills `profiles.email`, updates the new-user trigger, and keeps that field in sync when an Auth user changes email. The browser receives read access through the existing profiles SELECT grant and RLS policy; users cannot update their own email through this table. New project setups can use the updated `schema.sql` instead of applying this migration separately.

## Promote the first administrator

There is no admin option at sign-up. First register the intended account through Supabase Auth. Then, as the trusted project owner, replace the email below and run this in SQL Editor:

```sql
update public.profiles as profile
set role = 'admin'
from auth.users as auth_user
where profile.id = auth_user.id
  and auth_user.email = 'your-admin-email@example.com';
```

Check the affected row count and verify the profile's role in the SQL Editor. Do not expose this update operation through the browser. The browser is granted permission to change `full_name` only; the current Admin page is read-only, and changing roles remains a trusted SQL owner operation.

## Access rules in this schema

- New Auth users receive a profile row from a database trigger. The trigger reads only `full_name` metadata and copies the email from `auth.users`; `role` always comes from the database default (`user`). A separate trusted trigger keeps the profile email in sync with Auth email changes.
- A user can read their own profile and update only its `full_name`. Admins can read all profiles.
- Users can create, read, update, and delete only their own tasks.
- Users can insert their own session row; login and heartbeat timestamps default to database time. The `touch_user_session` and `close_user_session` RPCs update only an open session belonging to the caller. Users can read their own records; admins can read all records.
- Session history is best-effort. The browser heartbeat runs every 60 seconds. The Admin view considers a row active only if `last_seen_at` is within 2 minutes and `logout_at` is null. A browser crash, tab close, or network loss may leave `logout_at` empty. A recent `last_seen_at` is an estimate of activity, not reliable attendance data.
- The Admin page is read-only. Its profile/session queries are still restricted by RLS; hiding the Admin navigation for normal users is not the security boundary.

The admin-check function is `SECURITY DEFINER` to avoid recursively invoking the profiles policy. It uses an empty `search_path`, schema-qualified table references, and restricted execute grants. Session RPCs use the same fixed search path and check the caller's ID in the update itself.

## Stage 2 verification boundary

The schema was applied to the Supabase project on 2026-10-25. The dashboard inspection query returned `rowsecurity = true` for `profiles`, `tasks`, and `user_sessions`, and the policy query returned the expected eight policies. Those checks confirm installation, but do not simulate a regular user's access. Owner/non-owner data isolation must still be verified through authenticated sessions before treating the database security stage as fully tested.
