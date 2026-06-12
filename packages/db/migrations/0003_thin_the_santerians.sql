CREATE TABLE IF NOT EXISTS "credit_form_submissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"form_version" text NOT NULL,
	"data" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credit_form_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_form_submissions" ADD CONSTRAINT "credit_form_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_form_submissions" ADD CONSTRAINT "credit_form_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ============================================================================
-- Epic 2 — RLS for credit_form_submissions (hand-written, like 0001/0002).
-- Writes are service-role only (server action). Reads: the submitter sees their
-- own; UDTL staff see all; customers cannot see other people's submissions.
-- ============================================================================
CREATE INDEX IF NOT EXISTS credit_form_submissions_user_idx
  ON public.credit_form_submissions (user_id);
--> statement-breakpoint
ALTER TABLE public.credit_form_submissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.credit_form_submissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY credit_form_select ON public.credit_form_submissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_udtl_staff());
