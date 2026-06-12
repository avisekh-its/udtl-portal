/** FleetHunt client factory + key config. */
import type { FleetHuntClient } from "./types";
import { MockFleetHuntClient } from "./mock-client";
import { LiveFleetHuntClient } from "./live-client";

export const FLEETHUNT_API_KEYS = (process.env.FLEETHUNT_API_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

export type FleetHuntMode = "mock" | "live" | "off";

/**
 * live (keys present) → mock (no keys + FLEETHUNT_MOCK=true) → off.
 * Live wins whenever keys exist so production can never accidentally stay on
 * mock data just because the dev default flag was copied over.
 */
export function fleethuntMode(): FleetHuntMode {
  if (FLEETHUNT_API_KEYS.length > 0) return "live";
  if (process.env.FLEETHUNT_MOCK === "true") return "mock";
  return "off";
}

export function getFleetHuntClient(): FleetHuntClient | null {
  const mode = fleethuntMode();
  if (mode === "mock") return new MockFleetHuntClient();
  if (mode === "live") return new LiveFleetHuntClient(FLEETHUNT_API_KEYS[0]!);
  return null;
}

/** Keys the governor budgets against (mock still budgets one synthetic key). */
export function effectiveKeyCount(): number {
  return Math.max(1, FLEETHUNT_API_KEYS.length);
}

export function apiKeyAt(i: number): string {
  return FLEETHUNT_API_KEYS[i] ?? "mock-key";
}
