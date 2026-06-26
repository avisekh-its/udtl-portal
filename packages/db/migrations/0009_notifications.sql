-- 0009 — Notifications (Epic 9): per-order subscriptions, delivery log, CASL opt-outs.
-- Hand-authored + applied via psql (like 0001 / 0008). The app queries these via
-- supabase-js; writes go through the service-role dispatcher.

-- ── Per-order, per-event, per-channel subscriptions ───────────────────────────
create table if not exists public.notification_subscriptions (
  id          bigserial primary key,
  user_id     uuid    not null references public.users(id) on delete cascade,
  load_id     integer not null references public.loads(id) on delete cascade,
  event       text    not null,   -- assigned | in_transit | delivered | cancelled | delayed
  channel     text    not null,   -- email | sms | in_app
  consent_at  timestamptz not null default now(),  -- CASL: consent captured at subscribe
  created_at  timestamptz not null default now(),
  unique (user_id, load_id, event, channel)
);
create index if not exists nsub_load_event_idx on public.notification_subscriptions (load_id, event);
create index if not exists nsub_user_idx on public.notification_subscriptions (user_id);

-- ── Delivery log (also backs the in-app feed) ─────────────────────────────────
create table if not exists public.notification_log (
  id                  bigserial primary key,
  user_id             uuid    references public.users(id) on delete set null,
  load_id             integer references public.loads(id) on delete set null,
  event               text,
  channel             text    not null,   -- email | sms | in_app
  recipient           text,               -- email / phone / user id
  status              text    not null,   -- sent | failed | suppressed
  subject             text,
  body                text,
  provider_message_id text,
  error               text,
  read_at             timestamptz,        -- in-app read tracking
  created_at          timestamptz not null default now()
);
create index if not exists nlog_user_unread_idx on public.notification_log (user_id, read_at);
create index if not exists nlog_load_idx on public.notification_log (load_id);

-- ── CASL opt-outs (SMS STOP / email unsubscribe) ──────────────────────────────
create table if not exists public.notification_optouts (
  id         bigserial primary key,
  contact    text not null,   -- email or E.164 phone
  channel    text not null,   -- email | sms
  created_at timestamptz not null default now(),
  unique (contact, channel)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.notification_subscriptions enable row level security;
alter table public.notification_subscriptions force  row level security;
alter table public.notification_log           enable row level security;
alter table public.notification_log           force  row level security;
alter table public.notification_optouts       enable row level security;
alter table public.notification_optouts       force  row level security;

-- Subscriptions: a user manages their OWN subs, only for loads they can view;
-- staff may read all. (Inserts also require the load be visible to them.)
drop policy if exists nsub_select on public.notification_subscriptions;
create policy nsub_select on public.notification_subscriptions
  for select to authenticated
  using (public.is_udtl_staff() or user_id = auth.uid());

drop policy if exists nsub_insert on public.notification_subscriptions;
create policy nsub_insert on public.notification_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_load(load_id));

drop policy if exists nsub_delete on public.notification_subscriptions;
create policy nsub_delete on public.notification_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- Log: a user sees their own rows (in-app feed); staff read all. Writes/updates
-- happen via the service-role dispatcher (mark-read action), so no customer
-- write policy is granted.
drop policy if exists nlog_select on public.notification_log;
create policy nlog_select on public.notification_log
  for select to authenticated
  using (public.is_udtl_staff() or user_id = auth.uid());

-- Opt-outs: managed entirely by the service role (STOP webhook / unsubscribe),
-- no customer access — default-deny with RLS on and no policy.
