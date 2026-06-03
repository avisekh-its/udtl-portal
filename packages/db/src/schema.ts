/**
 * UDTL — Drizzle schema (Epic 0 skeleton)
 *
 * This file maps the FRD §5 data model into Drizzle tables.
 * Epic 0 ships only the SHAPES so the worker and web both compile against
 * a shared type surface. Real tables, indexes, RLS policies, and seed data
 * land in:
 *   - Epic 2 (Auth & RBAC) — orgs, users, sessions
 *   - Epic 3 (Order model) — loads, stops, contacts
 *   - Epic 4 (Tracking) — devices, location_history, eta_cache
 *   - Epic 5 (Notifications) — subscriptions, log
 *   - Epic 6 (Reporting) — materialised views
 */

import {
  pgTable,
  bigserial,
  text,
  timestamp,
  boolean,
  integer,
  real,
  uuid,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

/* ─────────────────────────────────────────────────────────────────────
   Enums
   FRD §6 load status lifecycle: New → Assigned → In Transit → Delivered (+ Cancelled).
   Delayed is a manual alert, NOT a status (see §6, §11.1).
───────────────────────────────────────────────────────────────────── */
export const loadStatus = pgEnum("load_status", [
  "new",
  "assigned",
  "in_transit",
  "delivered",
  "cancelled",
]);

export const userRole = pgEnum("user_role", [
  "udtl_admin",
  "udtl_staff",
  "udtl_account_manager",
  "customer_admin",
  "customer_user",
]);

export const stopType = pgEnum("stop_type", ["pickup", "delivery"]);

/* ─────────────────────────────────────────────────────────────────────
   Customer Organization — FRD §5.1
   Holds company info + additional contacts (separate table).
───────────────────────────────────────────────────────────────────── */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  country: text("country").default("CA"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Additional contacts on an org — FRD §5.1: type (billing/dispatch/etc.) + name/email/phone */
export const organizationContacts = pgTable("organization_contacts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'billing' | 'dispatch' | 'other' (free-text, validated in app)
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────────────────────────────────────────────────
   User — FRD §5.2
   Maps to Supabase auth.users via the id (uuid). Holds role + org + restricted flag.
───────────────────────────────────────────────────────────────────── */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // matches auth.users.id from Supabase Auth
  email: text("email").notNull().unique(),
  name: text("name"),
  phone: text("phone"),
  role: userRole("role").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  /** FRD §5.2: optional restricted flag for customer users */
  restricted: boolean("restricted").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ssoProvider: text("sso_provider"), // 'google' | 'microsoft' | 'saml' | null
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────────────────────────────────────────────────
   Tracking Device — FRD §5.5
   Mirror of a FleetHunt asset.
───────────────────────────────────────────────────────────────────── */
export const trackingDevices = pgTable("tracking_devices", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fleethuntAssetId: text("fleethunt_asset_id").notNull().unique(),
  name: text("name").notNull(),
  vin: text("vin"),
  plate: text("plate"),
  hasGpsGateway: boolean("has_gps_gateway").notNull().default(true),
  active: boolean("active").notNull().default(true),
  /** Latest known position fields cached for fast reads (FR-TRACK-002) */
  lastLat: real("last_lat"),
  lastLng: real("last_lng"),
  lastSpeed: real("last_speed"),
  lastHeading: real("last_heading"),
  lastOdometer: real("last_odometer"),
  lastFixAt: timestamp("last_fix_at", { withTimezone: true }),
  /** Which FleetHunt key was used to fetch this device — for back-off coordination */
  fleethuntKeyIndex: integer("fleethunt_key_index"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────────────────────────────────────────────────
   Load / Order — FRD §5.3
   Replaces fixed origin/destination with an ordered list of Stops (§5.4).
───────────────────────────────────────────────────────────────────── */
export const loads = pgTable("loads", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  /** Sequential UDTL load reference (e.g. UDTL-24187) */
  loadReference: text("load_reference").notNull().unique(),
  /** Non-guessable public tracking token (FR-PUB-012) */
  publicTrackingToken: text("public_tracking_token").notNull().unique(),
  /** Customer's PO / their own number */
  customerReference: text("customer_reference"),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  accountManagerId: uuid("account_manager_id").references(() => users.id),
  trackingDeviceId: integer("tracking_device_id").references(() => trackingDevices.id),
  status: loadStatus("status").notNull().default("new"),
  /** Computed live ETA (cached per FR-TRACK-005) */
  liveEtaAt: timestamp("live_eta_at", { withTimezone: true }),
  liveDistanceKm: real("live_distance_km"),
  liveEtaComputedAt: timestamp("live_eta_computed_at", { withTimezone: true }),
  /** Per-load cost — visibility to customers is config-toggled (FRD §18 #5) */
  perLoadCostCents: integer("per_load_cost_cents"),
  perLoadCostCurrency: text("per_load_cost_currency").default("CAD"),
  commodity: text("commodity"),
  weightKg: real("weight_kg"),
  pieces: integer("pieces"),
  specialInstructions: text("special_instructions"),
  /** JSONB for extensible audit-friendly metadata */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Customer users an order is explicitly assigned to — FRD §5.3 + §8 (restricted users) */
export const loadAssignedUsers = pgTable("load_assigned_users", {
  loadId: integer("load_id")
    .notNull()
    .references(() => loads.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────────────────────────────────────────────────
   Stop — FRD §5.4
   Each load has an ordered list of stops. Each stop has 1+ contacts.
───────────────────────────────────────────────────────────────────── */
export const stops = pgTable("stops", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  loadId: integer("load_id")
    .notNull()
    .references(() => loads.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: stopType("type").notNull(),
  name: text("name"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city").notNull(),
  region: text("region"),
  postalCode: text("postal_code"),
  country: text("country").default("CA"),
  /** Date+time WINDOW per FRD §12.1 (stored as range when ranges land; for now lo/hi) */
  plannedFromAt: timestamp("planned_from_at", { withTimezone: true }),
  plannedToAt: timestamp("planned_to_at", { withTimezone: true }),
  /** Actual times — only set when staff updates */
  actualAt: timestamp("actual_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Point of contact per stop — FRD §5.4 */
export const stopContacts = pgTable("stop_contacts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  stopId: integer("stop_id")
    .notNull()
    .references(() => stops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
});

/* ─────────────────────────────────────────────────────────────────────
   Location history — FRD §5.6
   Recent GPS breadcrumb per device. Real schema with indexing + TTL lands in Epic 4.
───────────────────────────────────────────────────────────────────── */
export const locationHistory = pgTable("location_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  trackingDeviceId: integer("tracking_device_id")
    .notNull()
    .references(() => trackingDevices.id, { onDelete: "cascade" }),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  speed: real("speed"),
  heading: real("heading"),
  odometer: real("odometer"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
});

/* ─────────────────────────────────────────────────────────────────────
   Audit log — FRD §13.2
───────────────────────────────────────────────────────────────────── */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), // 'load.created' | 'status.changed' | 'device.assigned' | …
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>(),
  sourceIp: text("source_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────────────────────────────────────────────────
   Type exports for use in apps/web and apps/worker
───────────────────────────────────────────────────────────────────── */
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Load = typeof loads.$inferSelect;
export type NewLoad = typeof loads.$inferInsert;
export type Stop = typeof stops.$inferSelect;
export type NewStop = typeof stops.$inferInsert;
export type TrackingDevice = typeof trackingDevices.$inferSelect;
export type NewTrackingDevice = typeof trackingDevices.$inferInsert;
export type LocationFix = typeof locationHistory.$inferSelect;
export type NewLocationFix = typeof locationHistory.$inferInsert;
