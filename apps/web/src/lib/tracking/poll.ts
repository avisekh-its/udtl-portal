/**
 * Central polling sweep (FR-TRACK-002/005/007/008).
 * For every active load with an assigned device: fetch the latest fix within the
 * per-key rate budget, store it, then recompute live ETA + distance-to-go and a
 * readable place name, caching them on the load. Degrades gracefully:
 *   - no GPS gateway → device skipped (display shows "live position not available")
 *   - FleetHunt error/outage → keep the last-known fix; ETA falls back to it
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFleetHuntClient, fleethuntMode, effectiveKeyCount } from "@/lib/fleethunt/client";
import { FleetHuntApiError } from "@/lib/fleethunt/types";
import { RateGovernor } from "@/lib/fleethunt/governor";
import { getMappingProvider, type LatLng, type MappingProvider } from "@/lib/mapping";
import { haversineKm } from "@/lib/tracking/geo";

/** Re-run `fn` over items with at most `limit` in flight (keeps the cron sweep
 *  within Vercel's 60s window without blasting the map providers). */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Place name is city-level; only re-geocode once the device moves this far. */
const PLACE_REFRESH_KM = 5;

export interface PollResult {
  devicesPolled: number;
  loadsUpdated: number;
  skippedNoBudget: number;
  mode: string;
}

const ACTIVE_STATUSES = ["new", "assigned", "in_transit"];

export async function pollActiveLoads(admin: SupabaseClient): Promise<PollResult> {
  const client = getFleetHuntClient();
  const mode = fleethuntMode();
  const empty: PollResult = { devicesPolled: 0, loadsUpdated: 0, skippedNoBudget: 0, mode };
  if (!client) return empty;

  const mapper = getMappingProvider();

  const { data: loads } = await admin
    .from("loads")
    .select("id, tracking_device_id, metadata")
    .in("status", ACTIVE_STATUSES)
    .not("tracking_device_id", "is", null);
  const loadRows = (loads ?? []) as {
    id: number;
    tracking_device_id: number;
    metadata: Record<string, unknown> | null;
  }[];
  if (loadRows.length === 0) return empty;

  const deviceIds = [...new Set(loadRows.map((l) => l.tracking_device_id))];
  const { data: deviceData } = await admin
    .from("tracking_devices")
    .select("id, fleethunt_asset_id, has_gps_gateway, last_lat, last_lng")
    .in("id", deviceIds);
  const devices = (deviceData ?? []) as {
    id: number;
    fleethunt_asset_id: string;
    has_gps_gateway: boolean;
    last_lat: number | null;
    last_lng: number | null;
  }[];
  const deviceById = new Map(devices.map((d) => [d.id, d]));

  // --- One snapshot of the whole fleet (FleetHunt returns all positions at once) ---
  const governor = await RateGovernor.load(admin, effectiveKeyCount());
  let devicesPolled = 0;
  let skippedNoBudget = 0;

  const keyIndex = governor.acquire();
  if (keyIndex === null) {
    skippedNoBudget = devices.length; // budget exhausted / backing off — keep last-known
  } else {
    try {
      const positions = await client.listPositions();
      const byAsset = new Map(positions.map((p) => [p.assetId, p]));
      const nowIso = new Date().toISOString();
      for (const d of devices) {
        const pos = byAsset.get(d.fleethunt_asset_id);
        if (!pos) continue; // device has no current fix → keep last-known
        d.last_lat = pos.lat;
        d.last_lng = pos.lng;
        await admin
          .from("tracking_devices")
          .update({
            last_lat: pos.lat,
            last_lng: pos.lng,
            last_speed: pos.speed ?? null,
            last_heading: pos.heading ?? null,
            last_odometer: pos.odometer ?? null,
            last_fix_at: pos.capturedAt,
            fleethunt_key_index: keyIndex,
            synced_at: nowIso,
          })
          .eq("id", d.id);
        await admin.from("location_history").insert({
          tracking_device_id: d.id,
          lat: pos.lat,
          lng: pos.lng,
          speed: pos.speed ?? null,
          heading: pos.heading ?? null,
          odometer: pos.odometer ?? null,
          captured_at: pos.capturedAt,
        });
        devicesPolled++;
      }
    } catch (e) {
      if (e instanceof FleetHuntApiError) governor.reportError(keyIndex, e.status);
    }
  }
  await governor.flush(admin);

  // --- Recompute ETA + place per load (fresh or last-known fix) ---
  // Parallelized (capped); reverse-geocode is skipped when the device hasn't
  // moved far enough to change the city-level place name (Nominatim fair-use).
  const updated = await runWithConcurrency(loadRows, 5, async (l) => {
    const device = deviceById.get(l.tracking_device_id);
    if (!device || device.last_lat == null || device.last_lng == null) return false;
    const fix: LatLng = { lat: device.last_lat, lng: device.last_lng };
    const meta = (l.metadata ?? {}) as {
      currentLat?: number;
      currentLng?: number;
      currentPlace?: string | null;
    };

    const dest = await destinationForLoad(admin, l.id, mapper);
    const eta = dest ? await mapper.routeEta(fix, dest) : null;

    // Reuse the cached place unless the device moved past the refresh radius.
    let place = meta.currentPlace ?? null;
    const movedKm =
      meta.currentLat != null && meta.currentLng != null
        ? haversineKm(fix, { lat: meta.currentLat, lng: meta.currentLng })
        : Infinity;
    if (!place || movedKm > PLACE_REFRESH_KM) {
      place = (await mapper.reverseGeocode(fix)) ?? place;
    }

    const now = Date.now();
    await admin
      .from("loads")
      .update({
        live_distance_km: eta?.distanceKm ?? null,
        live_eta_at: eta ? new Date(now + eta.durationMinutes * 60_000).toISOString() : null,
        live_eta_computed_at: new Date(now).toISOString(),
        metadata: {
          currentPlace: place,
          currentLat: fix.lat,
          currentLng: fix.lng,
          livePositionAvailable: true,
        },
      })
      .eq("id", l.id);
    return true;
  });

  return { devicesPolled, loadsUpdated: updated.filter(Boolean).length, skippedNoBudget, mode };
}

/** Destination = last stop; geocode + cache its coords if missing. */
async function destinationForLoad(
  admin: SupabaseClient,
  loadId: number,
  mapper: MappingProvider,
): Promise<LatLng | null> {
  const { data } = await admin
    .from("stops")
    .select("id, lat, lng, city, region, country")
    .eq("load_id", loadId)
    .order("sequence", { ascending: false })
    .limit(1);
  const last = data?.[0] as
    | { id: number; lat: number | null; lng: number | null; city: string; region: string | null; country: string | null }
    | undefined;
  if (!last) return null;
  if (last.lat != null && last.lng != null) return { lat: last.lat, lng: last.lng };

  const coords = await mapper.forwardGeocode(
    [last.city, last.region, last.country].filter(Boolean).join(", "),
  );
  if (coords) await admin.from("stops").update({ lat: coords.lat, lng: coords.lng }).eq("id", last.id);
  return coords;
}
