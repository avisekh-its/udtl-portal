CREATE TABLE IF NOT EXISTS "fleethunt_key_state" (
	"key_index" integer PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"backoff_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "lat" real;--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "lng" real;--> statement-breakpoint
-- ============================================================================
-- Epic 4 — location_history index + RLS for fleethunt_key_state (hand-written).
-- ============================================================================

-- Fast "latest fix for a device" + breadcrumb reads (TTL pruning is a follow-up).
CREATE INDEX IF NOT EXISTS location_history_device_time_idx
  ON public.location_history (tracking_device_id, captured_at DESC);
--> statement-breakpoint

-- fleethunt_key_state: service-role only (the cron). Lock out authenticated.
ALTER TABLE public.fleethunt_key_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.fleethunt_key_state FORCE ROW LEVEL SECURITY;
