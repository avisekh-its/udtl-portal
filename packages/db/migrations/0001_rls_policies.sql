-- ============================================================================
-- UDTL — Row Level Security (multi-tenant isolation)
-- ----------------------------------------------------------------------------
-- Security model:
--   * Internal UDTL staff (udtl_admin | udtl_staff | udtl_account_manager)
--       -> full visibility across all organizations.
--   * Customer users (customer_admin | customer_user)
--       -> only rows belonging to their own organization_id.
--   * Restricted customer users (users.restricted = true, FRD §8)
--       -> only loads explicitly assigned to them via load_assigned_users.
--
-- Roles & paths:
--   * `authenticated` = a logged-in Supabase Auth user. ALL policies below
--     target this role; `anon` is granted NOTHING (default-deny) so the public
--     tracking page MUST go through a server route using the service_role key
--     + the non-guessable public_tracking_token (FR-PUB-012), never the anon key.
--   * `service_role` BYPASSES RLS by design — server-side ops console writes,
--     the FleetHunt cron, and notifications run with it. App code enforces authz
--     on those paths. RLS here is the defense-in-depth backbone for any query
--     that reaches Postgres with a customer's JWT.
--
-- Helper functions are SECURITY DEFINER so they can read public.users without
-- being blocked by users' own RLS (which would otherwise recurse).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.current_user_org()
returns uuid
language sql stable security definer set search_path = public
as $$ select organization_id from public.users where id = auth.uid() $$;

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.users where id = auth.uid() $$;

create or replace function public.is_udtl_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('udtl_admin','udtl_staff','udtl_account_manager')
       from public.users where id = auth.uid()),
    false)
$$;

create or replace function public.is_restricted_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select restricted from public.users where id = auth.uid()), false)
$$;

-- Encapsulates the full "can this user see this load?" rule so stops /
-- stop_contacts can reuse it without duplicating the restricted-user logic.
create or replace function public.can_view_load(p_load_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when public.is_udtl_staff() then true
    else exists (
      select 1 from public.loads l
      where l.id = p_load_id
        and l.organization_id = public.current_user_org()
        and (
          not public.is_restricted_user()
          or exists (
            select 1 from public.load_assigned_users la
            where la.load_id = l.id and la.user_id = auth.uid()
          )
        )
    )
  end
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every public table (default-deny once enabled)
-- ---------------------------------------------------------------------------
alter table public.organizations         enable row level security;
alter table public.organization_contacts enable row level security;
alter table public.users                 enable row level security;
alter table public.tracking_devices      enable row level security;
alter table public.loads                 enable row level security;
alter table public.load_assigned_users   enable row level security;
alter table public.stops                 enable row level security;
alter table public.stop_contacts         enable row level security;
alter table public.location_history      enable row level security;
alter table public.audit_log             enable row level security;

-- Force RLS even for the table owner so a misconfigured connection can't leak.
-- (service_role still bypasses — it is BYPASSRLS at the role level.)
alter table public.organizations         force row level security;
alter table public.organization_contacts force row level security;
alter table public.users                 force row level security;
alter table public.tracking_devices      force row level security;
alter table public.loads                 force row level security;
alter table public.load_assigned_users   force row level security;
alter table public.stops                 force row level security;
alter table public.stop_contacts         force row level security;
alter table public.location_history      force row level security;
alter table public.audit_log             force row level security;

-- ---------------------------------------------------------------------------
-- organizations: customers see only their own org; staff see all
-- ---------------------------------------------------------------------------
create policy org_select on public.organizations
  for select to authenticated
  using (public.is_udtl_staff() or id = public.current_user_org());

-- ---------------------------------------------------------------------------
-- organization_contacts: scoped by parent org
-- ---------------------------------------------------------------------------
create policy org_contacts_select on public.organization_contacts
  for select to authenticated
  using (public.is_udtl_staff() or organization_id = public.current_user_org());

-- ---------------------------------------------------------------------------
-- users: always see yourself; staff see all; customers see users in their org
-- (lets customer_admin manage their org's user list)
-- ---------------------------------------------------------------------------
create policy users_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_udtl_staff()
    or organization_id = public.current_user_org()
  );

-- A user may update their own profile row. Role/org/restricted changes are
-- expected to flow through server (service_role) paths with app-side authz.
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- loads: the heart of tenant isolation
-- ---------------------------------------------------------------------------
create policy loads_select on public.loads
  for select to authenticated
  using (
    public.is_udtl_staff()
    or (
      organization_id = public.current_user_org()
      and (
        not public.is_restricted_user()
        or exists (
          select 1 from public.load_assigned_users la
          where la.load_id = loads.id and la.user_id = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- load_assigned_users: staff see all; customers see their own assignments
-- ---------------------------------------------------------------------------
create policy lau_select on public.load_assigned_users
  for select to authenticated
  using (public.is_udtl_staff() or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- stops + stop_contacts: visible iff the parent load is visible
-- ---------------------------------------------------------------------------
create policy stops_select on public.stops
  for select to authenticated
  using (public.can_view_load(load_id));

create policy stop_contacts_select on public.stop_contacts
  for select to authenticated
  using (
    exists (
      select 1 from public.stops s
      where s.id = stop_contacts.stop_id and public.can_view_load(s.load_id)
    )
  );

-- ---------------------------------------------------------------------------
-- tracking_devices + location_history: NO direct customer access.
-- Live positions are served to customers through server routes (service_role)
-- scoped to a specific load, never by querying these tables with a customer JWT.
-- Staff get direct read access for the ops console.
-- ---------------------------------------------------------------------------
create policy devices_select_staff on public.tracking_devices
  for select to authenticated
  using (public.is_udtl_staff());

create policy location_select_staff on public.location_history
  for select to authenticated
  using (public.is_udtl_staff());

-- ---------------------------------------------------------------------------
-- audit_log: staff read-only; customers have no access. Writes are server-side.
-- ---------------------------------------------------------------------------
create policy audit_select_staff on public.audit_log
  for select to authenticated
  using (public.is_udtl_staff());
