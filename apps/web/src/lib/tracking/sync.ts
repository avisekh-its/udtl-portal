/** Import / sync the FleetHunt asset list into tracking_devices (FR-TRACK-001). */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFleetHuntClient, fleethuntMode } from "@/lib/fleethunt/client";

export async function syncDevices(admin: SupabaseClient): Promise<{ synced: number; mode: string }> {
  const client = getFleetHuntClient();
  const mode = fleethuntMode();
  if (!client) return { synced: 0, mode };

  const assets = await client.listAssets();
  const rows = assets.map((a) => ({
    fleethunt_asset_id: a.assetId,
    name: a.name,
    vin: a.vin ?? null,
    plate: a.plate ?? null,
    has_gps_gateway: a.hasGpsGateway,
    active: a.active,
    synced_at: new Date().toISOString(),
  }));
  if (rows.length) {
    await admin.from("tracking_devices").upsert(rows, { onConflict: "fleethunt_asset_id" });
  }
  return { synced: rows.length, mode };
}
