DROP TABLE "credit_form_submissions" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credit_form_received" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credit_form_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credit_form_received_by" uuid;