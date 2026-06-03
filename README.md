# UDTL Customer Portal & Operations Console

Built by **ITS Inc.** for **United Dhillon Trucking Lines Inc. (UDTL)**.
Functional spec: `UDTL_FRD_v1.0.pdf` (shared internally).

This is the **Epic 0 scaffold** — the empty repo + hosting wiring. Real
features land in Epics 2 onward (auth → portal → ops → tracking → reports).

---

## Stack

| Layer | Choice | Hosted on |
|---|---|---|
| Web app | Next.js 15 (App Router) + TS | **Vercel** (YUL1) |
| Polling worker | Node.js + Drizzle | **Railway** |
| DB + Auth + Storage | Supabase (Postgres + Auth + Storage) | **Supabase** (ca-central-1) |
| ORM | Drizzle | shared via `@udtl/db` package |
| UI | Tailwind v4 + shadcn/ui | — |
| Map | Mapbox (light style, flat per client June 1 feedback) | — |
| Email | Resend + React Email | — |
| SMS | Twilio | — |
| PDF | `@react-pdf/renderer` | — |
| Errors | Sentry | — |

---

## Repo layout

```
UDTL/
├── apps/
│   ├── web/              Next.js 15 — deploys to Vercel
│   │   ├── src/app/      App Router pages
│   │   ├── src/lib/      Supabase + Drizzle helpers
│   │   └── src/components/
│   └── worker/           Node.js polling worker — deploys to Railway
│       ├── src/index.ts  Entry: setInterval poll loop, multi-key FleetHunt
│       └── Dockerfile
├── packages/
│   └── db/               Shared Drizzle schema + types (@udtl/db)
│       ├── src/schema.ts FRD §5 data model
│       ├── src/index.ts  getDb() factory
│       └── drizzle.config.ts
├── .github/workflows/
│   └── ci.yml            Lint + typecheck on PR
├── .env.example          Template for all env vars
├── vercel.json           Vercel monorepo config
├── railway.toml          Railway worker config
├── package.json          npm workspaces root
└── tsconfig.json         Base TS config
```

---

## Why the split between Vercel and Railway

FRD requires (FR-TRACK-002 + NFR-005):

- Background service polls FleetHunt ~every 30 s for actively-viewed loads
- Stays under 60 req/min/key, rotates across multiple keys
- Back-off on 429/503
- Runs continuously (not per-request)

Vercel Cron's minimum cadence is 1 min and each invocation is ephemeral —
no clean place to hold rate-limit state across multiple keys. So the worker
runs on Railway as a single persistent Node process (~$5/mo Hobby).

The Next.js web app runs on Vercel for first-class Next.js perks
(edge cache, RSC, image optimisation, preview deploys per PR).

---

## Local setup

### 1. Prereqs
- Node ≥ 22
- npm (workspaces)
- A Supabase project (create at [supabase.com](https://supabase.com), region `ca-central-1`)

### 2. Install
```sh
cd UDTL
npm install
```

### 3. Env files
```sh
cp .env.example .env.local            # for apps/web
cp .env.example apps/worker/.env      # for apps/worker
```

Fill in:
- `DATABASE_URL` — Supabase → Project Settings → Database → Connection string (URI / Pool mode)
- `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API
- `FLEETHUNT_API_KEYS` — comma-separated list, get from UDTL
- `NEXT_PUBLIC_MAPBOX_TOKEN` — from [account.mapbox.com](https://account.mapbox.com)
- The rest land as their epics arrive (Resend in Epic 5, Twilio in Epic 5, Sentry in Epic 0 once we have a project, hCaptcha in Epic 7).

### 4. Run
```sh
# in one terminal — web app at http://localhost:3000
npm run dev:web

# in another — polling worker
npm run dev:worker
```

### 5. Database migrations (once schema lands in Epic 2/3)
```sh
npm run db:generate          # generate migration from schema diff
npm run db:migrate           # apply pending migrations to DATABASE_URL
npm run db:studio            # open Drizzle Studio in browser
```

---

## Deploy

### Vercel (web app)
1. Connect this repo to a Vercel project
2. Set the root directory to `/` (Vercel reads `vercel.json` for the rest)
3. Pick **YUL1 (Montreal)** as the region in Project Settings → General (per FRD NFR-009 data residency)
4. Add all `NEXT_PUBLIC_*` and server env vars under Project Settings → Environment Variables
5. Set up a `staging` branch in addition to `main` for the staging environment

### Railway (polling worker)
1. Create a Railway project, link this repo
2. Set the root to `apps/worker` (Railway reads `apps/worker/Dockerfile`)
3. Or use `railway.toml` at the repo root which already points at the Dockerfile
4. Add the same env vars (DATABASE_URL, FLEETHUNT_*, SENTRY_*)
5. Pick the closest Canadian region

### Supabase
1. Create one project per environment (staging + production) — same region
2. Run migrations on each: `DATABASE_URL=... npm run db:migrate`
3. Configure auth providers in Authentication → Providers (Email + Google + Microsoft + SAML for UDTL staff per FR-AUTH-003)

---

## Conventions (Epic 0)

- **Time storage**: UTC (`timestamptz`). All times normalised before insert.
- **Time display**: local to viewing user via `Intl.DateTimeFormat`.
- **Date+time windows** (FRD §12.1): stored as `(planned_from_at, planned_to_at)` pair.
- **Secrets**: Vercel/Railway env vars + `.env.local`/`apps/worker/.env`. Never commit.
- **Errors**: Sentry (web + worker, separate environments).
- **Logging**: structured JSON (pino in the worker, console in Next.js).
- **IDs**: `uuid` for user/org (matches Supabase Auth), `bigserial` for internal IDs, `text` for public tokens.
- **Migrations**: Drizzle Kit, checked into git, applied via CI on deploy.

---

## What's pending (Section 17 of the FRD)

These are blockers for later epics — none affects Epic 0 scaffold:

1. Sample TMS order export file (defines load CSV format)
2. Confirmed required order fields
3. Quick-view fields for order list
4. Credit/sign-up form fields
5. Rating form content
6. Branding assets (logo, colours, fonts)
7. On-time multi-stop logic
8. Digest times (morning + EOD defaults)
9. Cost visibility default
10. Status names + 4 date field confirmation
11. Single primary contact at UDTL with 1–2 day feedback SLA

---

## Epic roadmap

| Epic | Focus | FRD sections |
|---|---|---|
| **0** | Stack + scaffold (this) | — |
| 1 | Stack confirmation deliverable (covered by Epic 0 doc) | — |
| 2 | Auth + RBAC | §13.1, §4 |
| 3 | Customer portal foundation (dashboard, orders, multi-stop view) | §8 |
| 4 | Live tracking + FleetHunt worker | §7 |
| 5 | Notifications (email + SMS + in-app) | §11 |
| 6 | Operations console (CRUD, CSV import, status updates) | §9 |
| 7 | Public + link-based tracking | §10 |
| 8 | Reporting + KPI dashboard | §12 |
| 9 | Comments + rating | §14, §15 |
| 10 | Audit + admin tools | §13.2 |

---

## License & confidentiality

Confidential. For ITS Inc. and UDTL internal use only.
