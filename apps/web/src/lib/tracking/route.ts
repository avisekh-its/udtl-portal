import "server-only";
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
