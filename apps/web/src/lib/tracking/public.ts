import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/loads";
import { loadRouteStops, loadRouteLine } from "@/lib/tracking/route";

/**
 * Public tracking domain (Epic 11). The ONLY place that turns an internal load
 * into the limited, safe-to-show public shape. It deliberately omits company
 * identities, financials, contacts, exact addresses, device/VIN, and any other
 * order — see PublicTracking. Both public entry points (the FedEx-style lookup
 * and the one-time email link) funnel through here, so the safe set is enforced
 * in one spot.
 */

export type ResolveResult =
  | { ok: true; loadId: number }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };

export interface PublicMilestone {
  status: LoadStatus;
  label: string;
  at: string | null;
  reached: boolean;
  current: boolean;
}
/** A stop reduced to what's safe on a public map: position + a city label only. */
export interface PublicMapStop {
  sequence: number;
  type: string;
  lat: number;
  lng: number;
  cityLabel: string | null;
}
export interface PublicTracking {
  trackingNumber: string;
  status: LoadStatus;
  statusLabel: string;
  origin: string | null; // "City, REG" — city-level only
  destination: string | null;
  plannedPickupAt: string | null;
  plannedDeliveryAt: string | null;
  estimatedDeliveryAt: string | null; // live ETA, only while in transit
  distanceKm: number | null;
  inTransit: boolean;
  milestones: PublicMilestone[];
  /** Present only while in transit with a live position. */
  map: { stops: PublicMapStop[]; line: { lat: number; lng: number }[]; truck: { lat: number; lng: number } } | null;
  updatedAt: string | null;
}

const STATUS_FLOW: LoadStatus[] = ["new", "assigned", "in_transit", "delivered"];
const FLOW_INDEX: Record<LoadStatus, number> = { new: 0, assigned: 1, in_transit: 2, delivered: 3, cancelled: 99 };

const cityLabel = (city: string | null, region: string | null): string | null => {
  const parts = [city, region].filter((p) => p && p.trim());
  return parts.length ? parts.join(", ") : null;
};

/**
 * Resolve a public token to a load id. A token beginning with "lnk_" is a
 * staff-generated link (subject to expiry/revocation); anything else is treated
 * as the order's permanent public tracking number. Returns a graceful reason on
 * failure (the caller renders "not found" / "link expired" / "link revoked").
 */
export async function resolveTrackingToken(raw: string): Promise<ResolveResult> {
  const token = raw.trim();
  if (!token) return { ok: false, reason: "not_found" };
  const admin = createServiceClient();

  if (token.startsWith("lnk_")) {
    const { data } = await admin
      .from("tracking_links")
      .select("load_id, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle();
    if (!data) return { ok: false, reason: "not_found" };
    if (data.revoked_at) return { ok: false, reason: "revoked" };
    if (new Date(data.expires_at as string).getTime() < Date.now()) return { ok: false, reason: "expired" };
    // Best-effort usage stamp (never blocks the view).
    await admin.from("tracking_links").update({ last_used_at: new Date().toISOString() }).eq("token", token);
    return { ok: true, loadId: data.load_id as number };
  }

  const { data } = await admin
    .from("loads")
    .select("id")
    .eq("public_tracking_token", token)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, loadId: data.id as number };
}

/** Build the safe public view for a resolved load. Returns null if the load vanished. */
export async function getPublicTracking(loadId: number): Promise<PublicTracking | null> {
  const admin = createServiceClient();
  const { data: load } = await admin
    .from("loads")
    .select(
      "id, status, public_tracking_token, live_eta_at, live_distance_km, updated_at, created_at, metadata, device:tracking_device_id ( has_gps_gateway, last_lat, last_lng, last_fix_at )",
    )
    .eq("id", loadId)
    .maybeSingle();
  if (!load) return null;

  const status = load.status as LoadStatus;
  const device = (Array.isArray(load.device) ? load.device[0] : load.device) as
    | { has_gps_gateway: boolean | null; last_lat: number | null; last_lng: number | null; last_fix_at: string | null }
    | null;

  // Origin / destination (city-level) and planned windows from the stops.
  const { data: stopRows } = await admin
    .from("stops")
    .select("sequence, type, city, region, planned_from_at")
    .eq("load_id", loadId)
    .order("sequence", { ascending: true });
  const stops = (stopRows ?? []) as { sequence: number; type: string; city: string | null; region: string | null; planned_from_at: string | null }[];
  const pickups = stops.filter((s) => s.type === "pickup");
  const deliveries = stops.filter((s) => s.type === "delivery");
  const firstPickup = pickups[0] ?? null;
  const lastDelivery = deliveries[deliveries.length - 1] ?? null;

  // Milestone timeline from the audit trail (status-change timestamps). Include
  // backward moves (load.status_reverted) too, else a corrected order shows gaps
  // in the customer-facing timeline (matches the portal detail view).
  const { data: auditRows } = await admin
    .from("audit_log")
    .select("after, created_at")
    .eq("entity_type", "load")
    .eq("entity_id", String(loadId))
    .in("action", ["load.status_changed", "load.status_reverted"])
    .order("created_at", { ascending: true });
  const firstReachedAt = new Map<LoadStatus, string>();
  for (const row of (auditRows ?? []) as { after: { status?: string } | null; created_at: string }[]) {
    const s = row.after?.status as LoadStatus | undefined;
    if (s && !firstReachedAt.has(s)) firstReachedAt.set(s, row.created_at);
  }

  let milestones: PublicMilestone[];
  if (status === "cancelled") {
    milestones = [
      { status: "new", label: LOAD_STATUS_LABELS.new, at: (load.created_at as string) ?? null, reached: true, current: false },
      { status: "cancelled", label: LOAD_STATUS_LABELS.cancelled, at: firstReachedAt.get("cancelled") ?? null, reached: true, current: true },
    ];
  } else {
    const idx = FLOW_INDEX[status];
    milestones = STATUS_FLOW.map((s) => ({
      status: s,
      label: LOAD_STATUS_LABELS[s],
      at: s === "new" ? ((load.created_at as string) ?? null) : (firstReachedAt.get(s) ?? null),
      reached: FLOW_INDEX[s] <= idx,
      current: s === status,
    }));
  }

  // Live position + route — only while in transit and only if we have a fix.
  const inTransit = status === "in_transit";
  let map: PublicTracking["map"] = null;
  const hasGateway = device?.has_gps_gateway !== false;
  if (inTransit && device && hasGateway && device.last_lat != null && device.last_lng != null) {
    const routeStops = await loadRouteStops(loadId);
    if (routeStops.length) {
      const line = await loadRouteLine(routeStops);
      map = {
        truck: { lat: device.last_lat, lng: device.last_lng },
        line,
        stops: routeStops.map((s) => ({
          sequence: s.sequence,
          type: s.type,
          lat: s.lat,
          lng: s.lng,
          cityLabel: cityLabel(s.city, s.region),
        })),
      };
    }
  }

  return {
    trackingNumber: (load.public_tracking_token as string) ?? "",
    status,
    statusLabel: LOAD_STATUS_LABELS[status] ?? status,
    origin: firstPickup ? cityLabel(firstPickup.city, firstPickup.region) : null,
    destination: lastDelivery ? cityLabel(lastDelivery.city, lastDelivery.region) : null,
    plannedPickupAt: firstPickup?.planned_from_at ?? null,
    plannedDeliveryAt: lastDelivery?.planned_from_at ?? null,
    estimatedDeliveryAt: inTransit ? ((load.live_eta_at as string) ?? null) : null,
    distanceKm: inTransit ? ((load.live_distance_km as number) ?? null) : null,
    inTransit,
    milestones,
    map,
    updatedAt: device?.last_fix_at ?? (load.updated_at as string) ?? null,
  };
}
