/**
 * Live FleetHunt HTTP client — confirmed against the real API (Epic-4 R&D).
 *
 * Auth:    Authorization: Bearer <key>  +  Accept: application/json
 * Devices: GET /api/devices → { status, devices: [ { id, name, lat, lng, speed,
 *          angle, odometer, dt_tracker_unix, is_active, vin, license_plate_no,
 *          loc_valid, … } ] } — the whole fleet WITH current positions in one
 *          call, so a single request per poll covers every device.
 */
import {
  FleetHuntApiError,
  type FleetHuntAsset,
  type FleetHuntClient,
  type FleetHuntPosition,
} from "./types";

const BASE = process.env.FLEETHUNT_BASE_URL ?? "https://app.fleethunt.ca";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapAsset(d: any): FleetHuntAsset {
  return {
    assetId: String(d.id),
    name: d.name ?? `Device ${d.id}`,
    vin: d.vin ?? null,
    plate: d.license_plate_no ?? null,
    // FleetHunt units are GPS trackers; there's no "no-gateway" concept — a
    // missing/stale fix is handled by loc_valid + the fix timestamp instead.
    hasGpsGateway: true,
    active: d.is_active === 1 || d.is_active === true,
  };
}

function mapPosition(d: any): FleetHuntPosition | null {
  const lat = toNum(d.lat ?? d.latitude);
  const lng = toNum(d.lng ?? d.longitude);
  if (lat === null || lng === null) return null;
  const unix = toNum(d.dt_tracker_unix);
  return {
    assetId: String(d.id),
    lat,
    lng,
    speed: toNum(d.speed),
    heading: toNum(d.angle),
    odometer: toNum(d.odometer),
    capturedAt: unix ? new Date(unix * 1000).toISOString() : new Date().toISOString(),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class LiveFleetHuntClient implements FleetHuntClient {
  constructor(private key: string) {}

  private async devices(): Promise<unknown[]> {
    const res = await fetch(`${BASE}/api/devices`, {
      headers: { Authorization: `Bearer ${this.key}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new FleetHuntApiError(res.status, `GET /api/devices ${res.status}`);
    const json = await res.json();
    return Array.isArray(json?.devices) ? json.devices : [];
  }

  async listAssets(): Promise<FleetHuntAsset[]> {
    return (await this.devices()).map(mapAsset);
  }

  async listPositions(): Promise<FleetHuntPosition[]> {
    return (await this.devices())
      .map(mapPosition)
      .filter((p): p is FleetHuntPosition => p !== null);
  }
}
