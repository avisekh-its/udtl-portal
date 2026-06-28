import { BrandMark } from "@/components/brand-mark";
import { RouteMap } from "@/components/route-map";
import type { LoadStatus } from "@/lib/loads";
import type { PublicTracking } from "@/lib/tracking/public";

/**
 * The single read-only public tracking view (Epic 11) — rendered identically for
 * both entry points (the public lookup and the one-time email link). Shows only
 * the safe, limited fields; everything sensitive is stripped upstream in
 * lib/tracking/public.ts, so this component never even receives it.
 */

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeZone: "America/Winnipeg",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Winnipeg",
});
const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");
const fmtDateTime = (iso: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");

const STATUS_TONE: Record<LoadStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-blue-50 text-blue-700",
  in_transit: "bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]",
  delivered: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
  cancelled: "bg-[var(--color-error)]/10 text-[var(--color-error)]",
};

export function PublicTrackingView({ data }: { data: PublicTracking }) {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <BrandMark />
          <span className="text-xs text-slate-400">Shipment tracking</span>
        </div>

        {/* Headline status */}
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Tracking number</p>
              <p className="mt-0.5 font-mono text-sm text-slate-700">{data.trackingNumber}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STATUS_TONE[data.status]}`}>
              {data.statusLabel}
            </span>
          </div>

          {/* Origin → destination (city-level) */}
          <div className="mt-5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-slate-400">From</p>
              <p className="truncate text-sm font-medium text-slate-800">{data.origin ?? "—"}</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
            <div className="min-w-0 flex-1 text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">To</p>
              <p className="truncate text-sm font-medium text-slate-800">{data.destination ?? "—"}</p>
            </div>
          </div>

          {/* Dates */}
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--color-border)] pt-4 sm:grid-cols-3">
            <Field label="Planned pickup" value={fmtDate(data.plannedPickupAt)} />
            <Field label="Planned delivery" value={fmtDate(data.plannedDeliveryAt)} />
            {data.inTransit && (
              <Field
                label="Estimated delivery"
                value={data.estimatedDeliveryAt ? fmtDateTime(data.estimatedDeliveryAt) : "Calculating…"}
                accent
              />
            )}
          </div>
          {data.inTransit && data.distanceKm != null && (
            <p className="mt-2 text-xs text-slate-500">{data.distanceKm} km remaining to destination.</p>
          )}
        </div>

        {/* Live map — only while in transit with a live position */}
        {data.map && (
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Live location</h2>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--color-secondary)]" /> Truck</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" /> Pickup</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" /> Destination</span>
              </div>
            </div>
            <RouteMap
              truck={data.map.truck}
              line={data.map.line}
              stops={data.map.stops.map((s) => ({
                sequence: s.sequence,
                type: s.type,
                name: null, // never expose stop names publicly
                city: s.cityLabel,
                region: null,
                lat: s.lat,
                lng: s.lng,
              }))}
            />
          </div>
        )}

        {/* Milestone timeline */}
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Progress</h2>
          <ol className="space-y-0">
            {data.milestones.map((m, i) => {
              const last = i === data.milestones.length - 1;
              return (
                <li key={m.status} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        m.current
                          ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]"
                          : m.reached
                            ? "border-[var(--color-success)] bg-[var(--color-success)]"
                            : "border-slate-300 bg-white"
                      }`}
                    >
                      {m.reached && !m.current && (
                        <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                    {!last && <span className={`w-0.5 flex-1 ${m.reached ? "bg-[var(--color-success)]" : "bg-slate-200"}`} style={{ minHeight: 28 }} />}
                  </div>
                  <div className="pb-5">
                    <p className={`text-sm font-medium ${m.reached ? "text-slate-800" : "text-slate-400"}`}>{m.label}</p>
                    <p className="text-xs text-slate-400">{m.at ? fmtDateTime(m.at) : m.reached ? "" : "Pending"}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="text-center text-xs text-slate-400">
          {data.updatedAt ? `Updated ${fmtDateTime(data.updatedAt)} · ` : ""}
          United Dhillon Trucking Lines
        </p>
      </div>
    </main>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${accent ? "text-[var(--color-secondary)]" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
