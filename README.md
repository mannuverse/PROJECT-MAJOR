# FlowDesk — Team Productivity Dashboard

FlowDesk is a student project for organizing personal tasks and presenting a clear view of team productivity. It is being built in small stages with HTML, CSS, modern JavaScript modules, Vite, and Supabase.

## Current stage

The app implements the foundation, Supabase schema and RLS, authentication, personal task management, a data-backed dashboard, best-effort session tracking, and read-only admin views. Production verification and GitHub/Vercel deployment are still pending. A calendar, habit tracker, and Pomodoro timer are not implemented.

For a detailed walkthrough of the architecture, JavaScript, database, security, deployment, troubleshooting, and a guided study plan, read [Learn FlowDesk](LEARN_FLOWDESK.md).

## Technology choices

- **HTML and CSS** provide semantic page structure and responsive styling.
- **Vanilla JavaScript with ES modules** keeps the application direct and easy to explain.
- **Vite** serves the app during development and creates the optimized production bundle.
- **Supabase** provides authentication and PostgreSQL persistence. Browser-side access uses only the public anon/publishable key, with Row Level Security enforced in the database.

## Requirements

- Node.js 20.19+ or 22.12+
- npm (included with Node.js)

## Run locally

From the project directory:

```sh
npm install
npm run dev
```

Vite opens the local page in your browser (normally `http://localhost:5173`). To create and inspect a production build:

```sh
npm run build
npm run preview
```

The preview command serves the generated `dist/` build locally.

## Environment variables

Copy the example environment file and edit it locally:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the public project URL and anon/publishable key from Supabase Project Settings. In Supabase **Authentication → URL Configuration**, allow `http://localhost:5173/**` as a redirect URL for confirmation and password-reset emails. Restart the dev server after changing `.env.local`. Vite exposes `VITE_` values to browser code; never put a service-role key or other private secret in a `VITE_` variable. `.env.local` is ignored by Git.

## Stage 3 authentication walkthrough

1. Apply `supabase/schema.sql` using the instructions in `supabase/README.md`.
2. Create `.env.local` using the steps above, then run `npm install` and `npm run dev`.
3. Register with a name, email, and password. New accounts receive the `user` role from the database trigger; the browser has no admin-role selector.
4. If email confirmation is enabled, follow the confirmation email and return to `http://localhost:5173/`.
5. Sign in. The signed-in page shows the name, email, and role loaded from Supabase, and has a working sign-out action.
6. Use **Forgot password?**, follow the reset email, and submit a matching new password.
7. Refresh while signed in to confirm Supabase restores the session.

Supabase email confirmation and password reset depend on the project's email delivery settings and limits. The built-in email provider can rate-limit reset emails during development. A rate-limit response means that check is pending; wait for the provider quota to recover or configure custom SMTP before trying again. Do not report password reset as verified until the link and password update both succeed.

## Stage 4 personal task management

After sign-in, the app loads the signed-in user's tasks from the `public.tasks` table. The task form supports title, description, status, priority, due date, and category. Tasks can be created, edited, completed, reopened, and deleted; the list supports title search, status and priority filters, and sorting by due or creation date. The database's owner-only RLS policies remain the authority for which rows can be read or changed.

Use two separate accounts to verify that one user's task list never contains the other user's rows. The manual checks are recorded in [`tests/manual-test-checklist.md`](tests/manual-test-checklist.md); unchecked items have not been verified.

## Stage 5 dashboard overview

The signed-in landing page summarizes the current user's real tasks due today, in progress, completed, and overdue. It includes due-today and upcoming lists, a completion progress bar, and a working quick action that opens the task form. Date-only due dates are compared with the user's local calendar date. Dashboard counts and progress are derived from the same Supabase-backed task list; no demo numbers are used.

## Stage 6 session history and admin

Authenticated sessions create a best-effort `user_sessions` row, update `last_seen_at` every 60 seconds while the page is open, and record `logout_at` on explicit sign-out when the database call succeeds. A session is labeled active only when its heartbeat is no more than 2 minutes old. Closing a tab or losing connectivity may leave an open, stale row; this is not attendance tracking.

The Admin navigation appears only for profiles whose database role is `admin`. The read-only Admin area shows account profiles and session activity with user/date filters and pagination. Database RLS remains the actual access control; regular users cannot query another user's profile or session rows. Role changes are not exposed in the browser and must use the documented trusted SQL setup.

For an existing Supabase project, apply `supabase/stage6_admin_email.sql` in SQL Editor before opening the profile directory. It adds/backfills profile emails and keeps them synced after an Auth email change. Then use the trusted SQL procedure in `supabase/README.md` to promote the intended first administrator. New projects should apply the updated `supabase/schema.sql` and then can skip the migration.

## Current file structure

```text
.
├── index.html
├── base.css
├── js/
│   ├── config.js
│   ├── lib/
│   │   └── supabaseClient.js
│   ├── pages/
│   │   ├── authPage.js
│   │   ├── adminPage.js
│   │   ├── dashboardPage.js
│   │   ├── signedInPage.js
│   │   └── tasksPage.js
│   └── services/
│       ├── authService.js
│       ├── adminService.js
│       ├── profileService.js
│       ├── sessionService.js
│       └── taskService.js
├── main.js
├── supabase/
│   ├── README.md
│   ├── stage6_admin_email.sql
│   └── schema.sql
├── tests/
│   └── manual-test-checklist.md
├── .env.example
├── .gitignore
├── package.json
└── vite.config.js
```

## Verification

The Supabase schema was applied, and the user confirmed RLS was enabled for the three tables with the expected eight policies. The user also confirmed sign-up/email confirmation/sign-in/profile display, refresh persistence, sign-out, task-stage behavior, the Stage 6 email migration, admin profile directory, and session activity. Password reset was blocked by Supabase's email rate limit during an earlier attempt. Checks not marked as complete in [`tests/manual-test-checklist.md`](tests/manual-test-checklist.md) remain unverified, including two-account RLS isolation and several task/admin edge cases. A production build after the full application changes has not yet been confirmed: Vite/esbuild returned `spawn EPERM` in the restricted command environment. Run `npm run build` in normal PowerShell. The last browser console report included `ERR_INTERNET_DISCONNECTED`, so the app could not reach Supabase at that time.

## Deployment

The planned deployment target is Vercel using the Vite preset, `npm run build`, and `dist` as the output directory. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's project environment settings; never use a service-role key in browser-exposed variables. Add the production domain to Supabase Auth's URL configuration and test the live sign-in/task flows. Do not treat the project as deployed until the live flow has been tested.

## Screenshots and future improvements

Screenshots will be added after the working dashboard is implemented. Planned work begins with PostgreSQL schema and Row Level Security, then authentication, personal task management, dashboard summaries, session history, and admin access. Optional features will wait until the required features are verified.
