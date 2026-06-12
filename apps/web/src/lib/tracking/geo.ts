/** Geo helpers shared by the mock mapping provider and ETA math. */
export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km between two points. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Deterministic pseudo-coordinate near central Canada from any string (mock geocode). */
export function pseudoCoord(seed: string): LatLng {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  // Spread around the Prairies (roughly Winnipeg ± a few degrees).
  const lat = 49.8 + ((h % 1000) / 1000) * 4 - 2;
  const lng = -97.1 + (((h >> 10) % 1000) / 1000) * 8 - 4;
  return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
}
