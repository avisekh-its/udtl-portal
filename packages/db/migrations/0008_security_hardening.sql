-- 0008 — Security hardening (manually authored, like 0001_rls_policies.sql).
-- Applied directly via psql against the Supabase DB.
--
-- (1) Close the users_update_self privilege-escalation hole: the existing
--     policy gates only on row ownership, so a customer holding their JWT +
--     the public anon key could PATCH their own row via PostgREST to set
--     role=udtl_admin / active=true / a different org. App-side guards only
--     protect the server-action path, not a direct DB write. We keep the
--     self-update policy (so users can edit name/phone) but add a trigger that
--     forbids changing privileged columns on a self-update. Service-role writes
--     (server actions) have auth.uid() = NULL, so they pass through unaffected.
--
-- (2) Make the customer cost-visibility toggle a real control: load_charges
--     SELECT now also requires the toggle (default TRUE, matching
--     isCostVisibleToCustomers()) for non-staff, instead of relying on the UI
--     to hide it.

-- ── (1) Privileged-column lock on self-update ──────────────────────────────
create or replace function public.users_block_priv_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = new.id and (
       new.role               is distinct from old.role
    or new.active             is distinct from old.active
    or new.restricted         is distinct from old.restricted
    or new.organization_id    is distinct from old.organization_id
    or new.credit_form_required is distinct from old.credit_form_required
    or new.credit_form_received is distinct from old.credit_form_received
  ) then
    raise exception 'cannot modify privileged columns on your own account';
  end if;
  return new;
end;
$$;

drop trigger if exists users_block_priv_self_update on public.users;
create trigger users_block_priv_self_update
  before update on public.users
  for each row execute function public.users_block_priv_self_update();

-- ── (2) Cost-visibility toggle enforced in RLS ─────────────────────────────
drop policy if exists load_charges_select on public.load_charges;
create policy load_charges_select on public.load_charges
  for select to authenticated
  using (
    public.can_view_load(load_id)
    and (
      public.is_udtl_staff()
      -- Visible unless the toggle is explicitly off. The setting may be stored
      -- as a JSON boolean (false) or a JSON string ("false"), so compare on the
      -- text form. Absent row => visible (Meeting 2 / isCostVisibleToCustomers).
      or coalesce(
           (select value::text not in ('false', '"false"')
              from public.app_settings
             where key = 'cost_visible_to_customers'),
           true
         )
    )
  );
