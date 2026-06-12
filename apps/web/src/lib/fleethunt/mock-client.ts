/**
 * Mock FleetHunt client — deterministic fleet + simulated movement, so the
 * whole polling/ETA pipeline runs and is testable WITHOUT real credentials or a
 * confirmed API contract. Enabled when FLEETHUNT_MOCK=true (or no API keys set).
 */
import type { FleetHuntAsset, FleetHuntClient, FleetHuntPosition } from "./types";
import { pseudoCoord } from "@/lib/tracking/geo";

const FLEET: FleetHuntAsset[] = [
  { assetId: "FH-1001", name: "Truck 12 — Freightliner", vin: "1FUJA6CV12L", plate: "MB-12345", hasGpsGateway: true, active: true },
  { assetId: "FH-1002", name: "Truck 27 — Kenworth", vin: "1XKWD49X28J", plate: "MB-22701", hasGpsGateway: true, active: true },
  { assetId: "FH-1003", name: "Truck 33 — Volvo", vin: "4V4NC9EH5GN", plate: "MB-33301", hasGpsGateway: true, active: true },
  { assetId: "FH-1004", name: "Trailer 88 (no gateway)", vin: null, plate: "MB-TR88", hasGpsGateway: false, active: true },
  { assetId: "FH-1005", name: "Truck 41 — Peterbilt", vin: "1XPWD40X1ED", plate: "MB-41100", hasGpsGateway: true, active: true },
];

export class MockFleetHuntClient implements FleetHuntClient {
  async listAssets(): Promise<FleetHuntAsset[]> {
    return FLEET;
  }

  async listPositions(): Promise<FleetHuntPosition[]> {
    const t = Math.floor(Date.now() / 30000); // changes every 30s
    return FLEET.filter((a) => a.hasGpsGateway).map((a) => {
      // Drift the base coordinate by a time-based offset so positions "move".
      const base = pseudoCoord(a.assetId);
      const driftLat = (((t + a.assetId.length) % 20) - 10) * 0.002;
      const driftLng = (((t * 7 + a.assetId.length) % 20) - 10) * 0.002;
      return {
        assetId: a.assetId,
        lat: Number((base.lat + driftLat).toFixed(5)),
        lng: Number((base.lng + driftLng).toFixed(5)),
        speed: 60 + (t % 30),
        heading: (t * 13) % 360,
        odometer: 100000 + t,
        capturedAt: new Date().toISOString(),
      };
    });
  }
}
