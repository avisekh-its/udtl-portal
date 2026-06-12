# UDTL Customer Portal & Operations Console

A logistics SaaS platform built by **ITS Inc.** for **United Dhillon Trucking Lines Inc. (UDTL)** — a customer-facing shipment-tracking portal and an internal operations console, in one Next.js application.

> **Confidential.** For ITS Inc. and UDTL internal use only.

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=next.js">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-3ecf8e?logo=supabase&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white">
</p>

---

## Overview

UDTL's dispatchers create and manage freight orders, assign GPS-tracked trucks, and watch the fleet on a live map. Their customers log in to a branded portal to see only their own shipments with live ETAs. The same database and role-based access control power both experiences, deployed entirely on Vercel + Supabase — no separate backend service.

**Live GPS tracking is wired to FleetHunt and running against the real fleet.** Mapping (routing, ETA, geocoding, and tiles) uses free, open providers — no Mapbox, no API token.

---

## Features

### Operations Console (UDTL staff & admin)
- **Dashboard** — KPI cards, loads-by-status and loads-by-customer charts, recent-loads and in-transit tables.
- **Orders / Loads** — UDTL's real order sheet: one shipper + N consignees, per-stop commodity blocks, order-level charges → total, missing-contact confirmation.
- **Order import** — single-order creation from a UDTL order-sheet **PDF**, and bulk creation via an ITS-format **CSV** (downloadable template, row-by-row validation, pre-commit preview, upsert by Customer Order # to avoid duplicates).
- **Live tracking** — FleetHunt positions polled centrally; live distance-to-go, ETA, and reverse-geocoded place names cached per load.
- **Tracking-device assignment** — assign / change / clear a FleetHunt device per load (availability + no-GPS-gateway flags, confirmation, fully audited).
- **Operations live map** — all active loads + tracked devices on a Leaflet/OpenStreetMap map; switch focus between orders and devices; per-load route overlay (pickup → stops → destination + live truck).
- **Customers & users** — manage customer organizations, invite users, credit-application gating, role assignment.
- **Audit log** — every status change, device/AM assignment, and import recorded.

### Customer Portal (customer admin & users)
- Branded dashboard showing **only the signed-in customer's** orders (enforced by Postgres Row-Level Security).
- Read-only live tracking (place, ETA, distance) per order.
- Customer-admin team management; restricted users see only orders explicitly assigned to them.

### Platform
- **Auth & RBAC** — email/password + a 5-role permission matrix as the single source of truth.
- **SSO** — optional Google / Microsoft sign-in that validates against an existing active user (convenience layer, any role).
- **Session hardening** — idle-timeout, login-attempt throttling.

---

## Tech stack

| Layer | Choice |
|---|---|
| Web app (full-stack) | Next.js 15 (App Router, Server Components & Actions) + TypeScript |
| Database / Auth | Supabase (Postgres + Auth + Row-Level Security) |
| ORM / schema | Drizzle, shared via the `@udtl/db` workspace package |
| UI | Tailwind CSS v4, custom component set (charcoal + orange UDTL branding) |
| Maps | **Leaflet + OpenStreetMap** tiles (free, no token) |
| Routing / ETA / geocoding | **OSRM** (driving routes) + **Nominatim** (geocode / reverse-geocode) |
| GPS provider | **FleetHunt** (`GET /api/devices` — whole fleet + positions per call) |
| Background jobs | Vercel Cron → Next.js route handlers |
| Hosting | Vercel (app + cron) · Supabase (`ca-central-1`) |

---

## Architecture

### Monorepo layout

```
UDTL/
├── apps/
│   └── web/                         Next.js 15 full-stack app (deploys to Vercel)
│       └── src/
│           ├── app/
│           │   ├── ops/             Operations console (staff/admin)
│           │   ├── portal/          Customer portal
│           │   ├── api/
│           │   │   ├── cron/        FleetHunt poll + scheduled jobs (Vercel Cron)
│           │   │   └── order-route/ Per-load route stops for the map
│           │   ├── login/  auth/    Auth flows + SSO callback
│           │   └── set-password/
│           ├── components/          UI: app shell, tables, charts, maps, forms
│           └── lib/                 auth, permissions, supabase, fleethunt,
│                                    mapping, tracking, audit
└── packages/
    └── db/                          Shared Drizzle schema + types (@udtl/db)
        ├── src/schema.ts            Data model
        └── migrations/              Checked-in SQL migrations
```

### FleetHunt polling model (cost-bounded)

The whole app — including background polling — runs on **Vercel only**; there is no separate worker. A **Vercel Cron** job invokes a route handler that takes a single bulk snapshot of the fleet:

- FleetHunt's `GET /api/devices` returns **the entire fleet with current positions in one call**, so one request per sweep covers every active load (well within the 200 req/min/key budget).
- Positions, ETAs, distances, and place names are written to **our** database; the UI reads from our DB, so any number of concurrent viewers cost **zero** extra FleetHunt calls.
- A rate-limit governor (persisted in Postgres, since serverless invocations are stateless) backs off on 429/503 and supports multiple keys.
- Cron routes authenticate via `Authorization: Bearer $CRON_SECRET`.

### Provider abstraction

FleetHunt and the mapping providers sit behind interfaces with **mock** and **live** implementations, so the full pipeline runs offline for development/UAT (`FLEETHUNT_MOCK=true`, `MAPPING_MOCK=true`) and flips to live by setting real keys.

---

## Roles & access (RBAC)

The permission matrix in `apps/web/src/lib/permissions.ts` is the single source of truth, enforced in the app **and** mirrored by Postgres Row-Level Security.

| Role | Scope |
|---|---|
| **UDTL Admin** | Full access incl. system settings & user management |
| **UDTL Staff** | Operations: load CRUD, status, device & AM assignment, customer management |
| **UDTL Account Manager** | Read-all + dashboard + receives comments (no edits) |
| **Customer Admin** | Own company: manage users, per-order access assignment |
| **Customer User** | Read own / assigned orders, comment, manage own subscriptions |

---

## Getting started

### Prerequisites
- **Node 22** (pinned in `.nvmrc` — run `nvm use`)
- npm (workspaces)
- A Supabase project (region `ca-central-1`)

### Install
```sh
nvm use
npm install
```

### Configure environment
```sh
cp .env.example apps/web/.env.local
```
Fill in at least the Supabase keys + `DATABASE_URL`. Leave `FLEETHUNT_MOCK=true` to run with a simulated fleet, or set `FLEETHUNT_API_KEYS` to go live. See [Environment variables](#environment-variables).

### Run
```sh
npm run dev          # http://localhost:3000
```
> Use **port 3000** — OAuth/SSO callbacks are configured against `localhost:3000`.

### Database migrations
```sh
npm run db:generate  # generate a migration from the schema diff
npm run db:migrate   # apply pending migrations to DATABASE_URL
npm run db:studio    # open Drizzle Studio
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the web app (port 3000) |
| `npm run build` | Build `@udtl/db` then the web app |
| `npm run typecheck` | TypeScript check across all workspaces |
| `npm run lint` | Lint across all workspaces |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |

---

## Environment variables

Copy `.env.example` → `apps/web/.env.local`. Key groups:

| Variable(s) | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | Supabase connection + server access |
| `FLEETHUNT_API_KEYS`, `FLEETHUNT_MOCK`, `FLEETHUNT_BASE_URL` | GPS provider (keys present → live; empty + mock → simulated) |
| `OSRM_BASE_URL`, `NOMINATIM_BASE_URL`, `MAPPING_MOCK` | Optional overrides for the free routing/geocoding providers |
| `CRON_SECRET` | Authenticates Vercel Cron → `/api/cron/*` (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_SSO_ENABLED`, Google/Microsoft client IDs | SSO (OAuth secrets are entered in the Supabase dashboard) |
| `SESSION_IDLE_MINUTES`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` | Auth hardening |

> **Never commit secrets.** `.env` / `.env.local` are git-ignored; only `.env.example` (placeholders) is tracked.

---

## Deployment

### Vercel (app + cron)
1. Connect this repo to a Vercel project (root directory `/`).
2. Add all server + `NEXT_PUBLIC_*` env vars, including `CRON_SECRET`.
3. The region and cron schedule are declared in `vercel.json` — no extra setup.

### Supabase
1. One project per environment (staging + production), same region.
2. Apply migrations: `DATABASE_URL=… npm run db:migrate`.
3. Configure Auth providers (Email, and Google/Microsoft for SSO) in **Authentication → Providers**.

---

## Security

- Secrets live only in environment variables; `.env*` is git-ignored.
- Customer data isolation is enforced at the database layer via Row-Level Security, not just the app.
- Privileged writes (activation, role) go through the service role on the server, never the client.
- Cron endpoints are bearer-token protected.

---

## License

Confidential and proprietary. © ITS Inc. / United Dhillon Trucking Lines Inc. All rights reserved.
