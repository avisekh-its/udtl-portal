import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { LoadTrackingPanel } from "@/components/load-tracking-panel";
import { RouteMap } from "@/components/route-map";
import { StatusTimeline, type TimelineEvent } from "@/components/status-timeline";
import { StatusChip } from "@/components/status-chip";
import { LOAD_STATUS_MAP } from "@/components/status-badge";
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/loads";
import { isCostVisibleToCustomers } from "@/lib/settings";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { NotifySubscriptions } from "@/components/notify-subscriptions";
import { CommentThread } from "@/components/comment-thread";
import { fetchComments } from "@/lib/comments";
import { loadRouteStops, loadRouteLine } from "@/lib/tracking/route";

const dateFmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Winnipeg" });
const fmt = (ts: string | null | undefined) => (ts ? dateFmt.format(new Date(ts)) : "—");

const STATUS_TONE: Record<string, string> = {
  new: "#94a3b8",
  assigned: "#3b82f6",
  in_transit: "#e85d1c",
  delivered: "#16a34a",
  cancelled: "#ef4444",
};

interface CommodityRow {
  sequence: number;
  commodity: string | null;
  pkg_qty: number | null;
  pkg_unit: string | null;
  weight: number | null;
  weight_unit: string | null;
  equipment: string | null;
  reefer: boolean;
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
  status: string;
  per_load_cost_currency: string | null;
  special_instructions: string | null;
  live_eta_at: string | null;
  live_distance_km: number | null;
  live_eta_computed_at: string | null;
  metadata: { currentPlace?: string | null; currentLat?: number; currentLng?: number } | null;
  stops: StopRow[];
  charges: ChargeRow[];
}

function addressOf(s: StopRow): string {
  return [s.address_line_1, s.address_line_2, [s.city, s.region, s.postal_code].filter(Boolean).join(" "), s.country]
    .filter(Boolean)
    .join(", ");
}

export default async function PortalOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loadId = Number(id);
  if (!Number.isFinite(loadId)) notFound();

  // RLS-scoped read — returns the load only if this customer may see it.
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("loads")
    .select(
      "id, load_reference, order_number, order_date, pickup_date, customer_reference, status, per_load_cost_currency, special_instructions, live_eta_at, live_distance_km, live_eta_computed_at, metadata, stops ( sequence, type, name, address_line_1, address_line_2, city, region, postal_code, country, planned_from_at, actual_at, contact_person, phone, notes, stop_commodities ( sequence, commodity, pkg_qty, pkg_unit, weight, weight_unit, equipment, reefer ) ), charges:load_charges ( sequence, description, amount_cents )",
    )
    .eq("id", loadId)
    .single();

  if (!data) notFound();
  const load = data as unknown as LoadRow;
  const meta = load.metadata ?? {};

  // The caller's notification subscriptions for this order (RLS → their own).
  const viewer = await getCurrentUser();
  const showNotify = !!viewer && !isStaff(viewer.role);
  const { data: subRows } = showNotify
    ? await supabase.from("notification_subscriptions").select("event, channel").eq("load_id", loadId)
    : { data: [] as { event: string; channel: string }[] };
  const subInitial = (subRows ?? []).map((s) => `${s.event}:${s.channel}`);
  // Whether the viewer has a phone on file (drives the inline SMS phone field).
  let viewerHasPhone = true;
  if (showNotify && viewer) {
    const { data: me } = await supabase.from("users").select("phone").eq("id", viewer.id).maybeSingle();
    viewerHasPhone = !!me?.phone;
  }

  const comments = viewer ? await fetchComments(loadId, viewer.id) : [];
  // Customers can't read tracking_devices (RLS), so derive "is it being tracked"
  // from the load's own cached fields. The internal device name is hidden.
  const isTracked = meta.currentPlace != null || load.live_eta_at != null || load.live_distance_km != null;
  const stops = [...(load.stops ?? [])].sort((a, b) => a.sequence - b.sequence);
  const charges = [...(load.charges ?? [])].sort((a, b) => a.sequence - b.sequence);
  const chip = LOAD_STATUS_MAP[load.status];

  const showCost = await isCostVisibleToCustomers();
  const routeStops = await loadRouteStops(load.id);
  const routeLine = await loadRouteLine(routeStops);
  const truck =
    meta.currentLat != null && meta.currentLng != null
      ? { lat: meta.currentLat, lng: meta.currentLng, place: meta.currentPlace }
      : null;

  // Status timeline from the audit log (service client; gated by the RLS read above).
  const audit = createServiceClient();
  const { data: events } = await audit
    .from("audit_log")
    .select("action, after, created_at")
    .eq("entity_type", "load")
    .eq("entity_id", String(load.id))
    .in("action", ["load.created", "load.status_changed", "load.status_reverted"])
    .order("created_at", { ascending: true });
  const timeline: TimelineEvent[] = ((events ?? []) as { action: string; after: Record<string, unknown> | null; created_at: string }[]).map(
    (e) => {
      if (e.action === "load.created") return { label: "Order created", at: fmt(e.created_at), tone: "#94a3b8" };
      const st = (e.after?.status as string) ?? "";
      return { label: `Status updated to ${LOAD_STATUS_LABELS[st as LoadStatus] ?? st}`, at: fmt(e.created_at), tone: STATUS_TONE[st] ?? "#94a3b8" };
    },
  );

  const total = charges.reduce((s, c) => s + c.amount_cents, 0);
  const currency = load.per_load_cost_currency ?? "CAD";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/orders" className="text-sm text-[var(--color-secondary)] hover:underline">
          ← Orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
            {load.order_number || load.load_reference}
          </h1>
          {chip && <StatusChip label={chip.label} tone={chip.tone} />}
        </div>
        {load.customer_reference && (
          <p className="mt-1 text-sm text-slate-500">Your reference: {load.customer_reference}</p>
        )}
      </div>

      <LoadTrackingPanel
        loadId={load.id}
        hasDevice={isTracked}
        deviceName={null}
        hasGateway={true}
        lastFixAt={load.live_eta_computed_at}
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
          <RouteMap stops={routeStops} truck={truck} line={routeLine} />
          {routeStops.length < stops.length && (
            <p className="mt-3 text-xs text-slate-400">
              Some stops can&apos;t be shown on the map yet — UDTL is completing the route details.
            </p>
          )}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* Order info */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Order details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Order #" value={load.order_number || load.load_reference} />
            <Field label="Order date" value={fmt(load.order_date)} />
            <Field label="Pickup date" value={fmt(load.pickup_date)} />
            <Field label="Your reference" value={load.customer_reference || "—"} />
            <Field label="Live ETA" value={fmt(load.live_eta_at)} />
            <Field label="Distance to go" value={load.live_distance_km != null ? `${load.live_distance_km} km` : "—"} />
          </dl>
          {load.special_instructions && (
            <div className="mt-4 border-t border-[var(--color-border)] pt-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Notes</div>
              <p className="mt-1 text-sm text-slate-700">{load.special_instructions}</p>
            </div>
          )}
        </div>

        {/* Status timeline */}
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Status timeline</h2>
          <StatusTimeline events={timeline} />
        </div>
      </div>

      {/* Stops */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Stops</h2>
        {stops.map((s, i) => {
          const deliveries = stops.filter((x) => x.type === "delivery");
          const isPickup = s.type === "pickup";
          const consigneeNo = deliveries.indexOf(s) + 1;
          return (
            <div key={i} className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${isPickup ? "bg-[#16a34a]" : "bg-[var(--color-secondary)]"}`}>
                  {isPickup ? "P" : consigneeNo}
                </span>
                <h3 className="text-sm font-semibold text-slate-800">
                  {isPickup ? "Shipper (pickup)" : `Consignee ${consigneeNo} (delivery)`}
                </h3>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Field label="Location" value={s.name || s.city} />
                <Field label="Address" value={addressOf(s)} className="sm:col-span-2" />
                <Field label="Contact" value={s.contact_person || "—"} />
                <Field label="Phone" value={s.phone || "—"} />
                <Field label="Scheduled" value={fmt(s.planned_from_at)} />
                <Field label="Actual" value={fmt(s.actual_at)} />
                {s.notes && <Field label="Notes" value={s.notes} className="sm:col-span-3" />}
              </dl>
              {s.stop_commodities.length > 0 && (
                <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Commodities</div>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {[...s.stop_commodities]
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((c, j) => (
                        <li key={j} className="flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className="font-medium">{c.commodity || "Goods"}</span>
                          {c.pkg_qty != null && <span className="text-slate-500">{c.pkg_qty} {c.pkg_unit}</span>}
                          {c.weight != null && <span className="text-slate-500">{c.weight} {c.weight_unit}</span>}
                          {c.equipment && <span className="text-slate-500">· {c.equipment}</span>}
                          {c.reefer && <span className="text-[var(--color-secondary)]">· Reefer</span>}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Charges (only if cost visibility is enabled) */}
      {showCost && charges.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Charges</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--color-border)]">
              {charges.map((c, i) => (
                <tr key={i}>
                  <td className="py-2 text-slate-700">{c.description}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">
                    ${(c.amount_cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--color-border)]">
                <td className="py-2 font-semibold text-slate-900">Total</td>
                <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                  ${(total / 100).toLocaleString("en-CA", { minimumFractionDigits: 2 })} {currency}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Comments (Epic 10) */}
      {viewer && (
        <CommentThread loadId={loadId} comments={comments} viewerIsStaff={isStaff(viewer.role)} />
      )}

      {/* Notification subscriptions (Epic 9) */}
      {showNotify && <NotifySubscriptions loadId={loadId} initial={subInitial} hasPhone={viewerHasPhone} />}
    </div>
  );
}

function Field({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value}</dd>
    </div>
  );
}
