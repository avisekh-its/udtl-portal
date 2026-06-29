-- 0012 — Post-delivery ratings (Epic 13). Hand-authored + applied via psql.
--
-- Staff MANUALLY send a rating request when a load is Delivered (never automatic
-- — avoids pestering regulars). One row per request doubles as the result: it
-- starts with score/review null (pending) and is filled in when the recipient
-- submits on the no-login /rate/<token> page. Expiring + revocable like the
-- Epic-11 tracking links.

create table if not exists public.ratings (
  id               bigserial primary key,
  load_id          integer not null references public.loads(id) on delete cascade,
  token            text    not null unique,
  requested_by     uuid    references public.users(id) on delete set null,
  recipient_email  text,
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  score            integer check (score between 1 and 5), -- null until submitted
  review           text,
  respondent_email text,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists ratings_load_idx  on public.ratings (load_id, created_at desc);
create index if not exists ratings_token_idx on public.ratings (token);
create index if not exists ratings_submitted_idx on public.ratings (submitted_at) where submitted_at is not null;

-- Service-role only: staff actions create/revoke; the public submission resolves
-- the token server-side. RLS on + no policy = default-deny to anon/customers.
alter table public.ratings enable row level security;
alter table public.ratings force  row level security;
