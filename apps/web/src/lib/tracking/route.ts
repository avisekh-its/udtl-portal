import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getMappingProvider } from "@/lib/mapping";

export interface RouteStop {
  sequence: number;
  type: string; // "pickup" | "delivery"
  name: string | null;
  city: string | null;
  region: string | null;
  lat: number;
  lng: number;
}

/**
 * A load's stops as map markers, ordered. Any stop missing coordinates is
 * geocoded once (free Nominatim) and the result persisted, so this is cheap on
 * repeat calls. Geocoded sequentially (few stops per load) to respect fair-use.
 */
export async function loadRouteStops(loadId: number): Promise<RouteStop[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("stops")
    .select("id, sequence, type, name, city, region, country, lat, lng")
    .eq("load_id", loadId)
    .order("sequence", { ascending: true });

  const stops = (data ?? []) as {
    id: number;
    sequence: number;
    type: string;
    name: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
  }[];

  const mapper = getMappingProvider();
  const out: RouteStop[] = [];

  for (const s of stops) {
    let { lat, lng } = s;
    if ((lat == null || lng == null) && s.city) {
      const query = [s.city, s.region, s.country].filter(Boolean).join(", ");
      const coords = await mapper.forwardGeocode(query);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        await admin.from("stops").update({ lat, lng }).eq("id", s.id);
      }
    }
    if (lat != null && lng != null) {
      out.push({ sequence: s.sequence, type: s.type, name: s.name, city: s.city, region: s.region, lat, lng });
    }
  }
  return out;
}

/**
 * Road geometry through a load's stops (for drawing the route line on the map).
 *
 * The route between a load's (fixed) stops is static, so we CACHE the routing
 * provider's response keyed by the stop coordinates — the map redraws on every
 * view, but OSRM is only called once per unique route (then served from cache
 * for 24h). If the stops change, the coordinate key changes and we recompute.
 */
export async function loadRouteLine(
  stops: { lat: number; lng: number }[],
): Promise<{ lat: number; lng: number }[]> {
  if (stops.length < 2) return [];
  const pts = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  // 4-decimal precision (~11m) — enough to identify a route, stable across calls.
  const key = pts.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  const cached = unstable_cache(
    async () => (await getMappingProvider().routeLine(pts)) ?? [],
    ["route-line", key],
    { revalidate: 60 * 60 * 24, tags: ["route-line"] },
  );
  return cached();
}
