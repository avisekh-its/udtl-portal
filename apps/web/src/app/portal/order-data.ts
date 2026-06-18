import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Customer-facing order rows. Queried with the user's session, so Postgres RLS
 * scopes them to the caller's organization (and assigned-only for restricted
 * users) — no app-side org filtering needed.
 */
export interface PortalOrderRow {
  id: number;
  ref: string; // order # or internal load reference
  loadReference: string;
  customerReference: string | null;
  status: string;
  pickupDate: string | null;
  origin: string;
  destination: string;
  liveEtaAt: string | null;
  updatedAt: string;
}

interface StopLite {
  sequence: number;
  type: string;
  city: string;
}

export async function fetchPortalOrders(): Promise<PortalOrderRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("loads")
    .select(
      "id, load_reference, order_number, customer_reference, status, pickup_date, updated_at, live_eta_at, stops ( sequence, type, city )",
    )
    .order("updated_at", { ascending: false });

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((l) => {
    const stops = (l.stops ?? []) as StopLite[];
    const deliveries = stops.filter((s) => s.type === "delivery").sort((a, b) => a.sequence - b.sequence);
    const pickup = stops.find((s) => s.type === "pickup");
    return {
      id: l.id as number,
      ref: (l.order_number as string) || (l.load_reference as string),
      loadReference: l.load_reference as string,
      customerReference: (l.customer_reference as string | null) ?? null,
      status: l.status as string,
      pickupDate: (l.pickup_date as string | null) ?? null,
      origin: pickup?.city ?? "",
      destination: deliveries.length ? deliveries[deliveries.length - 1]!.city : "",
      liveEtaAt: (l.live_eta_at as string | null) ?? null,
      updatedAt: l.updated_at as string,
    };
  });
}
