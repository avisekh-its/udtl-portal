/**
 * Mapping provider abstraction (Epic 4): live ETA + reverse/forward geocode.
 *
 * Per Meeting 3 (June 08) we use FREE providers — NOT Mapbox:
 *   - OSRM (router.project-osrm.org) for driving distance + duration (ETA)
 *   - Nominatim (OpenStreetMap) for reverse/forward geocoding
 * Both are key-free and open. The offline mock is still used when MAPPING_MOCK
 * is set (tests / no-network). All calls are resilient — they return null on
 * failure so the poll degrades gracefully (keeps the last-known fix).
 *
 * ⚠️ Prod note: the OSRM/Nominatim *public* servers have fair-use limits
 * (Nominatim ≈1 req/sec, OSRM demo not for heavy prod). For production, self-host
 * OSRM + Nominatim (or a managed equivalent) and point the base URLs there;
 * reverse-geocode results are cached on the load so we only re-geocode as the
 * device moves.
 */
import { haversineKm, pseudoCoord, type LatLng } from "@/lib/tracking/geo";

export type { LatLng };

export interface EtaResult {
  distanceKm: number;
  durationMinutes: number;
}

export interface MappingProvider {
  routeEta(from: LatLng, to: LatLng): Promise<EtaResult | null>;
  reverseGeocode(p: LatLng): Promise<string | null>;
  forwardGeocode(query: string): Promise<LatLng | null>;
}

const OSRM_BASE = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
const NOMINATIM_BASE = process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org";
// Nominatim's usage policy requires an identifying User-Agent.
const USER_AGENT = "UDTL-Portal/1.0 (dispatch@udtl.ca)";

const CITIES = [
  { name: "Winnipeg, MB", lat: 49.8951, lng: -97.1384 },
  { name: "Brandon, MB", lat: 49.8485, lng: -99.95 },
  { name: "Regina, SK", lat: 50.4452, lng: -104.6189 },
  { name: "Saskatoon, SK", lat: 52.1332, lng: -106.67 },
  { name: "Thunder Bay, ON", lat: 48.3809, lng: -89.2477 },
  { name: "Calgary, AB", lat: 51.0447, lng: -114.0719 },
  { name: "Fargo, ND", lat: 46.8772, lng: -96.7898 },
];

class MockMappingProvider implements MappingProvider {
  async routeEta(from: LatLng, to: LatLng): Promise<EtaResult> {
    const km = haversineKm(from, to) * 1.25; // straight-line → road factor
    const minutes = Math.round((km / 85) * 60); // ~85 km/h average
    return { distanceKm: Number(km.toFixed(1)), durationMinutes: minutes };
  }
  async reverseGeocode(p: LatLng): Promise<string> {
    let best: (typeof CITIES)[number] | null = null;
    let bestD = Infinity;
    for (const c of CITIES) {
      const d = haversineKm(p, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best && bestD < 90) return `near ${best.name}`;
    return `near ${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`;
  }
  async forwardGeocode(query: string): Promise<LatLng> {
    const hit = CITIES.find((c) => query.toLowerCase().includes(c.name.split(",")[0]!.toLowerCase()));
    return hit ? { lat: hit.lat, lng: hit.lng } : pseudoCoord(query);
  }
}

/** Free, key-less provider: OSRM (routing) + Nominatim (geocoding). */
class FreeMappingProvider implements MappingProvider {
  async routeEta(from: LatLng, to: LatLng): Promise<EtaResult | null> {
    try {
      const url = `${OSRM_BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const route = (await res.json())?.routes?.[0];
      if (!route) return null;
      return {
        distanceKm: Number((route.distance / 1000).toFixed(1)),
        durationMinutes: Math.round(route.duration / 60),
      };
    } catch {
      return null;
    }
  }

  async reverseGeocode(p: LatLng): Promise<string | null> {
    try {
      const url = `${NOMINATIM_BASE}/reverse?lat=${p.lat}&lon=${p.lng}&format=jsonv2&zoom=10&addressdetails=1`;
      const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) return null;
      const j = await res.json();
      const a = j?.address ?? {};
      const place = a.city || a.town || a.village || a.hamlet || a.county;
      const region = a.state || a.region;
      if (place) return region ? `near ${place}, ${region}` : `near ${place}`;
      if (j?.display_name) return `near ${String(j.display_name).split(",").slice(0, 2).join(",")}`;
      return `near ${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`;
    } catch {
      return null;
    }
  }

  async forwardGeocode(query: string): Promise<LatLng | null> {
    try {
      const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=1&countrycodes=ca,us`;
      const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) return null;
      const first = (await res.json())?.[0];
      if (!first) return null;
      return { lat: Number(first.lat), lng: Number(first.lon) };
    } catch {
      return null;
    }
  }
}

/** Free OSRM+Nominatim by default; offline mock when MAPPING_MOCK=true. */
export function getMappingProvider(): MappingProvider {
  if (process.env.MAPPING_MOCK === "true") return new MockMappingProvider();
  return new FreeMappingProvider();
}
