# ScholarPath PK

Free-first platform that helps Pakistani students find, prepare for, and track international scholarships.
See `docs/` for the PRD, architecture, database plan, module plan, decisions, progress and handoff.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase · Vercel

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run test:auth` | Auth end-to-end suite against a **local mock** of Supabase Auth + profiles (not live Supabase) |
| `npm run test:db` | Migrations + RLS/security tests on a **local** Postgres with a Supabase shim (not live Supabase) |

## Environment variables

See `.env.example`. Real values go in `.env.local` (git-ignored).

| Variable | Exposure | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Safe in browser; access is governed by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret, server-only** | Bypasses RLS. Never expose |
| `GEMINI_API_KEY`, `GROK_API_KEY` | **secret, server-only** | Used by later AI modules |
| `NEXT_PUBLIC_APP_URL` | public | Defaults to `http://localhost:3000` |

Secrets are read only in `src/lib/env.server.ts` (guarded by `server-only`; importing it from a Client Component fails the build).

## Authentication (Module 02)

Supabase Auth (email + password). Routes: `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/auth/callback`; post-login destination `/dashboard`.

**One-time Supabase dashboard setup** (Authentication → URL Configuration):
- *Site URL* = your `NEXT_PUBLIC_APP_URL`.
- *Redirect URLs* must include `<APP_URL>/auth/callback` (add the Vercel preview/production URLs too).
- Choose whether *Confirm email* is on. Both modes are supported (on: signup shows "check your email").
- Recommended: set the minimum password length to 8 to match the app's validation.

**Protection:** `src/proxy.ts` refreshes the session and redirects (optimistic check); pages re-check server-side with `requireUser()` / `requireRole()` from `src/lib/auth/session.ts`. Put authenticated pages inside `src/app/(protected)/`.

**Roles (Module 03):** the only source of truth is `public.profiles.role` (`student` by default). Clients can never change it. Grant roles with the service-only function, e.g. in the Supabase SQL editor (first admin):

```sql
select public.set_user_role(
  (select id from auth.users where email = 'you@example.com'), 'admin');
```

From server code use the service-role client (`src/lib/supabase/admin.ts`) and `supabase.rpc('set_user_role', {...})`. Changes apply immediately (the role is read from the database, not the JWT).

## Database (Module 03)

Schema, RLS and the private `documents` storage bucket live in `supabase/migrations/` (apply in order):

```bash
supabase link --project-ref <ref> && supabase db push     # Supabase CLI
# or paste each file, in order, into the SQL editor
```

Tests: `npm run test:db` applies the migrations to a throwaway **local** Postgres (with a small Supabase shim) and runs `tests/db/rls.test.sql` (two users, admin, mentor, anon; storage; role escalation). It is **not** live Supabase. `tests/db/rls.test.sql` is a single rolled-back transaction and can also be run against a scratch Supabase database with `psql "$DATABASE_URL" -f tests/db/rls.test.sql` (do not run against production data).

## Structure

```text
src/
  app/                 routes, layout, error/not-found/loading boundaries, /api/health
  components/ui/       shadcn/ui primitives (button, card)
  components/layout/   header, footer, page container
  lib/supabase/        client.ts (browser), server.ts (server), proxy.ts (session refresh), admin.ts (service role, server-only)
  lib/auth/            actions (server actions), session guards, route policy, roles, validation
  components/auth/     auth forms and shared form pieces
  proxy.ts             Next.js 16 proxy (session refresh + route protection)
  tests/auth-mock/     mock Supabase Auth server + e2e suite (dev only)
  lib/config/          site configuration
  lib/env.ts           public env access      lib/env.server.ts   server-only secrets
supabase/migrations/   database schema, RLS and storage (Module 03)
tests/db/              RLS/security test suite (local Postgres)
docs/                  project documentation and handoff
```

Add more shadcn components with `npx shadcn@latest add <component>` (`components.json` is configured).

`GET /api/health` reports whether Supabase env vars are configured (booleans only, never values).
