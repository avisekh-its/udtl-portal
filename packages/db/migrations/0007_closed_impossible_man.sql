CREATE TABLE IF NOT EXISTS "load_charges" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"load_id" integer NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stop_commodities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stop_id" integer NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"commodity" text,
	"pkg_qty" real,
	"pkg_unit" text DEFAULT 'Pieces',
	"weight" real,
	"weight_unit" text DEFAULT 'Pounds',
	"length_in" real,
	"breadth_in" real,
	"height_in" real,
	"equipment" text,
	"rate_method" text,
	"reefer" boolean DEFAULT false NOT NULL,
	"value_of_goods" real
);
--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "order_number" text;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "order_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "pickup_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "contact_person" text;--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "notes" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "load_charges" ADD CONSTRAINT "load_charges_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stop_commodities" ADD CONSTRAINT "stop_commodities_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ============================================================================
-- Epic 3 (order-sheet) — RLS + indexes for stop_commodities & load_charges.
-- Visible iff the parent load is visible (reuses can_view_load). Writes are
-- service-role (ops console). Customer cost-visibility toggle is enforced in the
-- app/view layer (Epic 7), not here.
-- ============================================================================
CREATE INDEX IF NOT EXISTS stop_commodities_stop_idx ON public.stop_commodities (stop_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS load_charges_load_idx ON public.load_charges (load_id);
--> statement-breakpoint
ALTER TABLE public.stop_commodities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.stop_commodities FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stop_commodities_select ON public.stop_commodities
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stops s
    WHERE s.id = stop_commodities.stop_id AND public.can_view_load(s.load_id)
  ));
--> statement-breakpoint
ALTER TABLE public.load_charges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.load_charges FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY load_charges_select ON public.load_charges
  FOR SELECT TO authenticated
  USING (public.can_view_load(load_id));
