CREATE TYPE "public"."load_status" AS ENUM('new', 'assigned', 'in_transit', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stop_type" AS ENUM('pickup', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('udtl_admin', 'udtl_staff', 'udtl_account_manager', 'customer_admin', 'customer_user');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"source_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "load_assigned_users" (
	"load_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"load_reference" text NOT NULL,
	"public_tracking_token" text NOT NULL,
	"customer_reference" text,
	"organization_id" uuid NOT NULL,
	"account_manager_id" uuid,
	"tracking_device_id" integer,
	"status" "load_status" DEFAULT 'new' NOT NULL,
	"live_eta_at" timestamp with time zone,
	"live_distance_km" real,
	"live_eta_computed_at" timestamp with time zone,
	"per_load_cost_cents" integer,
	"per_load_cost_currency" text DEFAULT 'CAD',
	"commodity" text,
	"weight_kg" real,
	"pieces" integer,
	"special_instructions" text,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loads_load_reference_unique" UNIQUE("load_reference"),
	CONSTRAINT "loads_public_tracking_token_unique" UNIQUE("public_tracking_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "location_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tracking_device_id" integer NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"speed" real,
	"heading" real,
	"odometer" real,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_contacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"primary_contact_name" text,
	"primary_contact_email" text,
	"primary_contact_phone" text,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text DEFAULT 'CA',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stop_contacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stop_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stops" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"load_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"type" "stop_type" NOT NULL,
	"name" text,
	"address_line_1" text,
	"address_line_2" text,
	"city" text NOT NULL,
	"region" text,
	"postal_code" text,
	"country" text DEFAULT 'CA',
	"planned_from_at" timestamp with time zone,
	"planned_to_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracking_devices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fleethunt_asset_id" text NOT NULL,
	"name" text NOT NULL,
	"vin" text,
	"plate" text,
	"has_gps_gateway" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_lat" real,
	"last_lng" real,
	"last_speed" real,
	"last_heading" real,
	"last_odometer" real,
	"last_fix_at" timestamp with time zone,
	"fleethunt_key_index" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_devices_fleethunt_asset_id_unique" UNIQUE("fleethunt_asset_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"role" "user_role" NOT NULL,
	"organization_id" uuid,
	"restricted" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"sso_provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "load_assigned_users" ADD CONSTRAINT "load_assigned_users_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "load_assigned_users" ADD CONSTRAINT "load_assigned_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loads" ADD CONSTRAINT "loads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loads" ADD CONSTRAINT "loads_account_manager_id_users_id_fk" FOREIGN KEY ("account_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loads" ADD CONSTRAINT "loads_tracking_device_id_tracking_devices_id_fk" FOREIGN KEY ("tracking_device_id") REFERENCES "public"."tracking_devices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loads" ADD CONSTRAINT "loads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "location_history" ADD CONSTRAINT "location_history_tracking_device_id_tracking_devices_id_fk" FOREIGN KEY ("tracking_device_id") REFERENCES "public"."tracking_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stop_contacts" ADD CONSTRAINT "stop_contacts_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stops" ADD CONSTRAINT "stops_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
