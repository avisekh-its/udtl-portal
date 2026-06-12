import { requireCapability } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { fleethuntMode } from "@/lib/fleethunt/client";
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/loads";
import { LiveMap, type OrderMarker, type DeviceMarker } from "@/components/live-map";

const ACTIVE_STATUSES = ["new", "assigned", "in_transit"];
const asOfFmt = new Intl.DateTimeFormat("en-CA", { timeStyle: "short", timeZone: "America/Winnipeg" });

interface LoadRow {
  id: number;
  load_reference: string;
  order_number: string | null;
  status: string;
  live_eta_at: string | null;
  live_distance_km: number | null;
  metadata: { currentPlace?: string | null } | null;
  organization: { name: string } | { name: string }[] | null;
  device:
    | { id: number; name: string; plate: string | null; last_lat: number | null; last_lng: number | null; last_fix_at: string | null }
    | { id: number; name: string; plate: string | null; last_lat: number | null; last_lng: number | null; last_fix_at: string | null }[]
    | null;
}
interface DeviceRow {
  id: number;
  name: string;
  plate: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_fix_at: string | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Operations live map (FR-TRACK-006). Visible to Admin/Staff/Account Managers. */
export default async function OpsMapPage() {
  await requireCapability("view_all_loads");
  const supabase = await createServerClient();

  const [{ data: loadData }, { data: deviceData }] = await Promise.all([
    supabase
      .from("loads")
      .select(
        "id, load_reference, order_number, status, live_eta_at, live_distance_km, metadata, organization:organization_id ( name ), device:tracking_device_id ( id, name, plate, last_lat, last_lng, last_fix_at )",
      )
      .in("status", ACTIVE_STATUSES),
    supabase
      .from("tracking_devices")
      .select("id, name, plate, last_lat, last_lng, last_fix_at")
      .eq("active", true)
      .eq("has_gps_gateway", true),
  ]);

  const loads = (loadData ?? []) as unknown as LoadRow[];

  // Which device is on which active load (for the device-view "assigned" badge).
  const deviceToLoadRef = new Map<number, string>();
  for (const l of loads) {
    const dev = one(l.device);
    if (dev) deviceToLoadRef.set(dev.id, l.order_number || l.load_reference);
  }

  const orders: OrderMarker[] = [];
  for (const l of loads) {
    const dev = one(l.device);
    if (!dev || dev.last_lat == null || dev.last_lng == null) continue;
    const org = one(l.organization);
    orders.push({
      id: l.id,
      ref: l.order_number || l.load_reference,
      customer: org?.name ?? "—",
      statusLabel: LOAD_STATUS_LABELS[l.status as LoadStatus] ?? l.status,
      lat: dev.last_lat,
      lng: dev.last_lng,
      place: l.metadata?.currentPlace ?? null,
      etaAt: l.live_eta_at,
      distanceKm: l.live_distance_km,
      deviceName: dev.name,
      lastFixAt: dev.last_fix_at,
    });
  }

  const devices: DeviceMarker[] = ((deviceData ?? []) as DeviceRow[])
    .filter((d) => d.last_lat != null && d.last_lng != null)
    .map((d) => ({
      id: d.id,
      name: d.name,
      plate: d.plate,
      lat: d.last_lat as number,
      lng: d.last_lng as number,
      lastFixAt: d.last_fix_at,
      assignedRef: deviceToLoadRef.get(d.id) ?? null,
    }));

  const mode = fleethuntMode();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Live map</h1>
        <p className="mt-1 text-sm text-slate-500">
          Active loads and tracked devices on the map.{" "}
          <span className="font-medium text-slate-600">Mode: {mode}</span> · positions are cached from the
          tracking poll (the map doesn’t call FleetHunt directly).
        </p>
      </div>

      <LiveMap orders={orders} devices={devices} asOf={asOfFmt.format(new Date())} />
    </div>
  );
}
