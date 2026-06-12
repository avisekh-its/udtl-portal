/**
 * FleetHunt polling — Vercel Cron entry point (FR-TRACK-002).
 *
 * Vercel Cron invokes this on a schedule (vercel.json). It (optionally) syncs
 * the asset list, then polls positions for devices on active loads within the
 * per-key rate budget and recomputes ETA/distance/place. The UI reads from OUR
 * DB at ~30s, so viewers cost ZERO FleetHunt calls — the cron is the only cost.
 *
 * Modes: live (FLEETHUNT_API_KEYS set) · mock (FLEETHUNT_MOCK=true) · off.
 * Security: requires `Authorization: Bearer $CRON_SECRET` in production.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { fleethuntMode } from "@/lib/fleethunt/client";
import { syncDevices } from "@/lib/tracking/sync";
import { pollActiveLoads } from "@/lib/tracking/poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.APP_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const mode = fleethuntMode();
  if (mode === "off") {
    return Response.json({ ok: true, skipped: "FleetHunt not configured", mode, at: new Date().toISOString() });
  }

  try {
    const admin = createServiceClient();
    // Keep the asset list fresh (1 call); could be throttled to hourly in live.
    const sync = await syncDevices(admin);
    const poll = await pollActiveLoads(admin);
    return Response.json({
      ok: true,
      mode,
      sync,
      poll,
      ms: Date.now() - startedAt,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "poll failed" },
      { status: 500 },
    );
  }
}
