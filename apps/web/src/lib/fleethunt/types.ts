/**
 * FleetHunt provider abstraction (Epic 4).
 *
 * The rest of the app depends ONLY on these interfaces, so the live HTTP client
 * and the mock client are interchangeable. Flip to live by setting
 * FLEETHUNT_API_KEYS (and confirming the response shapes in live-client.ts
 * against the real API — FRD §7 R&D item).
 */
export interface FleetHuntAsset {
  assetId: string;
  name: string;
  vin?: string | null;
  plate?: string | null;
  hasGpsGateway: boolean;
  active: boolean;
}

export interface FleetHuntPosition {
  assetId: string;
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  odometer?: number | null;
  /** ISO timestamp of the fix. */
  capturedAt: string;
}

export interface FleetHuntClient {
  /** Full asset list (FR-TRACK-001). */
  listAssets(): Promise<FleetHuntAsset[]>;
  /**
   * Latest position for EVERY device in ONE call. FleetHunt's /api/devices
   * returns the whole fleet with embedded positions, so the poll takes a single
   * snapshot per sweep (trivially within the rate limit). Throws
   * FleetHuntApiError on 429/503 so the governor can back off.
   */
  listPositions(): Promise<FleetHuntPosition[]>;
}

/** Thrown for HTTP errors we react to (429/503 → back-off). */
export class FleetHuntApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "FleetHuntApiError";
  }
}
