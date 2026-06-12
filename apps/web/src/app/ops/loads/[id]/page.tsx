import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { LoadForm, type OrgOption, type AmOption } from "@/components/load-form";
import { LoadStatusControl } from "@/components/load-status-control";
import { LoadTrackingPanel } from "@/components/load-tracking-panel";
import { DeviceAssignControl } from "@/components/device-assign-control";
import { RouteMap } from "@/components/route-map";
import { loadFormOptions } from "../form-data";
import { deviceAssignmentOptions } from "../assignment-data";
import { loadRouteStops } from "@/lib/tracking/route";
import type { LoadInput, LoadStatus, StopType, CommodityInput } from "@/lib/loads";

/** datetime-local string from a stored timestamp (kept as wall-clock). */
function toLocal(ts: string | null): string {
  return ts ? ts.slice(0, 16) : "";
}
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

interface CommodityRow {
  sequence: number;
  commodity: string | null;
  pkg_qty: number | null;
  pkg_unit: string | null;
  weight: number | null;
  weight_unit: string | null;
  length_in: number | null;
  breadth_in: number | null;
  height_in: number | null;
  equipment: string | null;
  rate_method: string | null;
  reefer: boolean;
  value_of_goods: number | null;
}
interface StopRow {
  sequence: number;
  type: string;
  name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  planned_from_at: string | null;
  planned_to_at: string | null;
  actual_at: string | null;
  contact_person: string | null;
  phone: string | null;
  notes: string | null;
  stop_commodities: CommodityRow[];
}
interface ChargeRow {
  sequence: number;
  description: string;
  amount_cents: number;
}
interface LoadRow {
  id: number;
  load_reference: string;
  order_number: string | null;
  order_date: string | null;
  pickup_date: string | null;
  customer_reference: string | null;
  organization_id: string;
  account_manager_id: string | null;
  status: string;
  per_load_cost_currency: string | null;
  special_instructions: string | null;
  live_eta_at: string | null;
  live_distance_km: number | null;
  metadata: { currentPlace?: string | null; currentLat?: number; currentLng?: number } | null;
  organization: { name: string } | { name: string }[] | null;
  device:
    | { id: number; name: string; has_gps_gateway: boolean; last_fix_at: string | null }
    | { id: number; name: string; has_gps_gateway: boolean; last_fix_at: string | null }[]
    | null;
  stops: StopRow[];
  charges: ChargeRow[];
}

function commodityInit(c: CommodityRow): CommodityInput {
  return {
    commodity: c.commodity ?? "",
    pkgQty: str(c.pkg_qty),
    pkgUnit: c.pkg_unit ?? "Pieces",
    weight: str(c.weight),
    weightUnit: c.weight_unit ?? "Pounds",
    lengthIn: str(c.length_in),
    breadthIn: str(c.breadth_in),
    heightIn: str(c.height_in),
    equipment: c.equipment ?? "",
    rateMethod: c.rate_method ?? "",
    reefer: c.reefer,
    valueOfGoods: str(c.value_of_goods),
  };
}

export default async function LoadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("create_edit_loads");
  const { id } = await params;
  const loadId = Number(id);
  if (!Number.isFinite(loadId)) notFound();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("loads")
    .select(
      "id, load_reference, order_number, order_date, pickup_date, customer_reference, organization_id, account_manager_id, status, per_load_cost_currency, special_instructions, live_eta_at, live_distance_km, metadata, organization:organization_id ( name ), device:tracking_device_id ( id, name, has_gps_gateway, last_fix_at ), stops ( sequence, type, name, address_line_1, address_line_2, city, region, postal_code, country, planned_from_at, planned_to_at, actual_at, contact_person, phone, notes, stop_commodities ( sequence, commodity, pkg_qty, pkg_unit, weight, weight_unit, length_in, breadth_in, height_in, equipment, rate_method, reefer, value_of_goods ) ), charges:load_charges ( sequence, description, amount_cents )",
    )
    .eq("id", loadId)
    .single();

  if (!data) notFound();
  const load = data as unknown as LoadRow;
  const org = Array.isArray(load.organization) ? load.organization[0] : load.organization;
  const device = Array.isArray(load.device) ? load.device[0] : load.device;
  const meta = (load.metadata ?? {}) as { currentPlace?: string | null; currentLat?: number; currentLng?: number };
  const stops = [...(load.stops ?? [])].sort((a, b) => a.sequence - b.sequence);
  const charges = [...(load.charges ?? [])].sort((a, b) => a.sequence - b.sequence);

  const initial: LoadInput = {
    organizationId: load.organization_id,
    orderNumber: load.order_number ?? "",
    orderDate: toLocal(load.order_date),
    pickupDate: toLocal(load.pickup_date),
    customerReference: load.customer_reference ?? "",
    accountManagerId: load.account_manager_id ?? "",
    currency: load.per_load_cost_currency ?? "CAD",
    specialInstructions: load.special_instructions ?? "",
    charges: charges.length
      ? charges.map((c) => ({ description: c.description, amount: (c.amount_cents / 100).toFixed(2) }))
      : [{ description: "Freight Charge", amount: "" }],
    stops: stops.map((s) => ({
      type: s.type as StopType,
      name: s.name ?? "",
      addressLine1: s.address_line_1 ?? "",
      addressLine2: s.address_line_2 ?? "",
      city: s.city,
      region: s.region ?? "",
      postalCode: s.postal_code ?? "",
      country: s.country ?? "CA",
      plannedFromAt: toLocal(s.planned_from_at),
      plannedToAt: toLocal(s.planned_to_at),
      actualAt: toLocal(s.actual_at),
      contactPerson: s.contact_person ?? "",
      phone: s.phone ?? "",
      notes: s.notes ?? "",
      commodities: (s.stop_commodities ?? []).length
        ? [...s.stop_commodities].sort((a, b) => a.sequence - b.sequence).map(commodityInit)
        : [{ commodity: "", pkgUnit: "Pieces", weightUnit: "Pounds", reefer: false }],
    })),
  };

  const { orgs, accountManagers } = await loadFormOptions();
  const deviceOptions = await deviceAssignmentOptions(load.id);
  const routeStops = await loadRouteStops(load.id);
  const truck =
    meta.currentLat != null && meta.currentLng != null && device?.has_gps_gateway !== false
      ? { lat: meta.currentLat, lng: meta.currentLng, place: meta.currentPlace }
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ops/loads" className="text-sm text-[var(--color-secondary)] hover:underline">
          ← Loads
        </Link>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight text-slate-900">
          {load.order_number || load.load_reference}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{org?.name ?? "—"}</p>
      </div>

      <DeviceAssignControl
        loadId={load.id}
        current={device ? { id: device.id, name: device.name, hasGateway: device.has_gps_gateway } : null}
        options={deviceOptions}
      />

      <LoadTrackingPanel
        hasDevice={!!device}
        deviceName={device?.name}
        hasGateway={device?.has_gps_gateway}
        lastFixAt={device?.last_fix_at}
        place={meta.currentPlace}
        distanceKm={load.live_distance_km}
        etaAt={load.live_eta_at}
      />

      {routeStops.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Route</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" /> Pickup</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" /> Destination</span>
              {truck && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--color-secondary)]" /> Truck</span>}
            </div>
          </div>
          <RouteMap stops={routeStops} truck={truck} />
        </div>
      )}

      <LoadStatusControl loadId={load.id} current={load.status as LoadStatus} />

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-700">Order details</h2>
        <LoadForm
          mode="edit"
          loadId={load.id}
          orgs={orgs as OrgOption[]}
          accountManagers={accountManagers as AmOption[]}
          initial={initial}
        />
      </div>
    </div>
  );
}
