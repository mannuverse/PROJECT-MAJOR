# FlowDesk manual test checklist

Record only checks that have actually been run or explicitly confirmed by the user. The user reported Stage 4 is all good, but individual task checks and two-account isolation were not separately recorded.

## Authentication

- [x] Sign-up confirmation, sign-in, and profile name/email/role display work.
- [ ] Invalid or duplicate credentials show a useful error.
- [x] Sign-out returns to the login screen.
- [x] Refresh preserves the signed-in session.
- [ ] Password reset link and password update complete successfully. A Supabase email rate limit blocked this check; retry after the quota recovers or after configuring custom SMTP.

## Database and authorization

- [x] RLS is enabled on profiles, tasks, and user_sessions.
- [x] The expected eight policies were present in Supabase.
- [ ] Create a task as Account A, then sign in as Account B and confirm it is absent.
- [ ] Attempt to read, update, and delete Account A's task as Account B through an authenticated client; all must be denied or return no row.
- [ ] Confirm a regular user cannot change their own role to admin.

## Task management

- [ ] Required title validation blocks empty titles.
- [ ] Create a task and confirm it appears after reload.
- [ ] Edit title, description, status, priority, due date, and category; confirm saved values persist.
- [ ] Mark a task complete and reopen it.
- [ ] Delete a task and confirm the confirmation prompt appears.
- [ ] Search by title and combine search with status and priority filters.
- [ ] Sort by due date and created date.
- [ ] Confirm overdue labels use local dates and do not label completed tasks overdue.
- [ ] Confirm empty, loading, and database error states are understandable.
- [ ] Confirm data remains after refresh and belongs only to the signed-in account.

## Quality

- [ ] npm run build succeeds.
- [ ] Browser console has no errors during the task flows.
- [ ] Layout is usable on a narrow mobile screen and a desktop screen.
- [ ] No visible button is a placeholder.
- [ ] No service-role key or private secret is present in browser code or committed files.


## Dashboard overview

- [ ] Due today, in progress, completed, and overdue cards match the signed-in user's tasks.
- [ ] Due-today comparison uses the local calendar date; completed past-due tasks are not counted as overdue.
- [ ] Today and upcoming sections show the correct real tasks and useful empty states.
- [ ] Completion bar percent matches completed tasks divided by total tasks.
- [ ] Quick-create actions open My Tasks and focus the task title field.
- [ ] Overview and My Tasks navigation works in both directions.
- [ ] A new account with no tasks sees zero-valued summaries and the create-first-task empty state, not demo data.
- [ ] Summary and task panels remain usable at mobile and desktop widths.


## Session history and admin

- [ ] Signing in creates or resumes one recent session row for the current browser tab.
- [ ] Repeated auth-state events and page refresh do not create uncontrolled duplicate rows.
- [ ] last_seen_at updates about once per minute while the page remains open.
- [ ] Explicit sign-out writes logout_at when the close RPC succeeds.
- [ ] Closing a tab may leave logout_at empty; the admin UI labels stale sessions using the 2-minute threshold.
- [ ] Normal users do not see Admin navigation and cannot read other users' profiles or sessions through direct authenticated requests.
- [x] Admin profile directory showed names, email, role, and creation date after the profile count was refreshed.
- [x] Admin session table loaded login/logout/last-seen columns, duration, and status after the status badge fix.
- [ ] Admin filters sessions by user and login date and paginates the loaded records.
- [ ] Admin overview counts match database data for profiles, last-7-day logins, and recent heartbeats.
- [x] The stage6_admin_email.sql migration was applied successfully for the existing project.
- [x] The first admin was promoted with trusted SQL; the browser has no role-changing control.
