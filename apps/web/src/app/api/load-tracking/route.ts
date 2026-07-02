import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Live-tracking snapshot for one load — polled by LoadTrackingPanel every ~30s
 * so the UI refreshes without a reload (FR-TRACK-002: reads OUR cached data at
 * zero FleetHunt cost). RLS scopes the read: staff see any load, customers only
 * their own; the tracking_devices join nulls out for customers (staff-only
 * table), so no device internals ever reach the portal.
 */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("loadId"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad loadId." }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data } = await supabase
    .from("loads")
    .select(
      "live_eta_at, live_distance_km, live_eta_computed_at, metadata, device:tracking_device_id ( has_gps_gateway, last_fix_at )",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const meta = (data.metadata ?? {}) as { currentPlace?: string | null };
  const device = (Array.isArray(data.device) ? data.device[0] : data.device) as {
    has_gps_gateway: boolean | null;
    last_fix_at: string | null;
  } | null;

  return NextResponse.json({
    place: meta.currentPlace ?? null,
    distanceKm: (data.live_distance_km as number | null) ?? null,
    etaAt: (data.live_eta_at as string | null) ?? null,
    // Customers can't read the device (RLS) — fall back to the compute stamp.
    lastFixAt: device?.last_fix_at ?? (data.live_eta_computed_at as string | null) ?? null,
  });
}
