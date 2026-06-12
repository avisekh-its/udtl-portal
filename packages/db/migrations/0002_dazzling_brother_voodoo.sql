CREATE TABLE IF NOT EXISTS "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"succeeded" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ============================================================================
-- Epic 1 auth hardening — RLS for login_attempts + admin-only audit log.
-- (Hand-written, in the style of 0001_rls_policies. RLS is not represented in
--  the Drizzle schema/snapshot, so these statements live only in the SQL.)
-- ============================================================================

-- Index the throttle lookups (by email, within a recent time window).
CREATE INDEX IF NOT EXISTS login_attempts_email_time_idx
  ON public.login_attempts (email, attempted_at DESC);
--> statement-breakpoint

-- login_attempts: only the service role touches this table. Enable + FORCE RLS
-- with NO policies for `authenticated`/`anon` → default-deny for everyone except
-- service_role (which is BYPASSRLS).
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.login_attempts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Admin predicate helper (mirrors is_udtl_staff, but admin-only).
CREATE OR REPLACE FUNCTION public.is_udtl_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((SELECT role = 'udtl_admin' FROM public.users WHERE id = auth.uid()), false)
$$;
--> statement-breakpoint

-- audit_log: tighten read access from all staff to UDTL Admin only
-- (FR-AUDIT-002 — "Audit log viewer for UDTL Admin only").
DROP POLICY IF EXISTS audit_select_staff ON public.audit_log;
--> statement-breakpoint
CREATE POLICY audit_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_udtl_admin());
