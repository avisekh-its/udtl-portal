-- 0011 — Public & link-based tracking (Epic 11). Hand-authored + applied via psql.
--
-- Two no-login ways to track a shipment, both rendering the SAME read-only view:
--   1. A permanent, non-guessable per-order token (loads.public_tracking_token,
--      already created in 0000) — the "FedEx-style" tracking number for the
--      public lookup page.
--   2. A staff-generated, EXPIRING + REVOCABLE one-off email link (tracking_links
--      below) for a single order.
--
-- Anti-abuse: every public lookup attempt is logged (tracking_lookups) so the
-- lookup page can rate-limit per IP and gate with a CAPTCHA after repeated
-- failures. Tokens are 128-bit random, so enumeration is infeasible regardless.

-- Staff-generated one-time tracking links. Token is separate from the permanent
-- public token so revoking/expiring a shared link never disturbs the order's
-- standing tracking number.
create table if not exists public.tracking_links (
  id              bigserial primary key,
  load_id         integer     not null references public.loads(id) on delete cascade,
  token           text        not null unique,
  created_by      uuid        references public.users(id) on delete set null,
  recipient_email text,
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists tracking_links_load_idx  on public.tracking_links (load_id, created_at desc);
create index if not exists tracking_links_token_idx on public.tracking_links (token);

-- Per-IP attempt log for the public lookup page (rate-limit + CAPTCHA trigger).
-- Short-lived rows; safe to prune periodically (not security-critical history).
create table if not exists public.tracking_lookups (
  id         bigserial primary key,
  ip         text,
  ok         boolean     not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tracking_lookups_ip_idx on public.tracking_lookups (ip, created_at desc);

-- Both tables are managed exclusively by the service role (staff actions generate
-- /revoke links; the public route resolves tokens + logs attempts server-side).
-- RLS on with NO policy = default-deny for any direct client (anon or customer).
alter table public.tracking_links   enable row level security;
alter table public.tracking_links   force  row level security;
alter table public.tracking_lookups enable row level security;
alter table public.tracking_lookups force  row level security;
