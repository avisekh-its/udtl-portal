import "server-only";
import { createServerClient } from "@/lib/supabase/server";

export interface DeviceOption {
  id: number;
  name: string;
  asset: string;
  plate: string | null;
  hasGateway: boolean;
  active: boolean;
  /** The OTHER active load currently using this device, if any (for the picker). */
  assignedTo: { loadId: number; ref: string } | null;
}

const ACTIVE_STATUSES = ["new", "assigned", "in_transit"];

/**
 * Devices selectable for a load's tracking, annotated with availability so the
 * picker can flag "in use on UDTL-####" and "no GPS gateway". `currentLoadId` is
 * excluded from the in-use check (a load's own device isn't "taken").
 */
export async function deviceAssignmentOptions(currentLoadId: number): Promise<DeviceOption[]> {
  const supabase = await createServerClient();

  const [{ data: devices }, { data: activeLoads }] = await Promise.all([
    supabase
      .from("tracking_devices")
      .select("id, fleethunt_asset_id, name, plate, has_gps_gateway, active")
      .eq("active", true)
      .order("name"),
    supabase
      .from("loads")
      .select("id, load_reference, order_number, tracking_device_id")
      .in("status", ACTIVE_STATUSES)
      .not("tracking_device_id", "is", null),
  ]);

  const usedBy = new Map<number, { loadId: number; ref: string }>();
  for (const l of activeLoads ?? []) {
    const did = l.tracking_device_id as number | null;
    if (did == null || l.id === currentLoadId) continue;
    if (!usedBy.has(did)) {
      usedBy.set(did, { loadId: l.id as number, ref: (l.order_number as string) || (l.load_reference as string) });
    }
  }

  return ((devices ?? []) as Record<string, unknown>[]).map((d) => ({
    id: d.id as number,
    name: d.name as string,
    asset: d.fleethunt_asset_id as string,
    plate: (d.plate as string | null) ?? null,
    hasGateway: d.has_gps_gateway as boolean,
    active: d.active as boolean,
    assignedTo: usedBy.get(d.id as number) ?? null,
  }));
}
