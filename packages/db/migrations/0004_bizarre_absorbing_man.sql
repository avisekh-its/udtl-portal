CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ============================================================================
-- Epic 3 — load reference sequence, app_settings RLS + seed (hand-written).
-- ============================================================================

-- Sequential, human-friendly load references: UDTL-1000, UDTL-1001, …
CREATE SEQUENCE IF NOT EXISTS public.load_reference_seq START WITH 1000;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.next_load_reference()
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT 'UDTL-' || nextval('public.load_reference_seq')::text $$;
--> statement-breakpoint

-- Seed the cost-visibility toggle: default VISIBLE to customers (Meeting 2 / §18 #5).
INSERT INTO public.app_settings (key, value)
VALUES ('cost_visible_to_customers', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- app_settings RLS: readable by any authenticated user (views honour toggles);
-- writes happen via service-role (admin-gated in app code).
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);
