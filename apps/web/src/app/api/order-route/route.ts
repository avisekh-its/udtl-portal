import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { loadRouteStops } from "@/lib/tracking/route";

/**
 * Stops (pickup → consignees) for one load, for the ops-map focus overlay.
 * A route handler (not a server action) so fetching it does NOT trigger a route
 * re-render — which would otherwise wipe the map's marker layers.
 */
export async function GET(req: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "view_all_loads")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const id = Number(req.nextUrl.searchParams.get("loadId"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Bad loadId." }, { status: 400 });
  }
  const stops = await loadRouteStops(id);
  return NextResponse.json({ stops });
}
