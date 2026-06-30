"use client";

/**
 * Operations live map (FR-TRACK-006). Plain Leaflet + free OpenStreetMap tiles
 * (no Mapbox/token — per Meeting 3). Reads Epic-4's CACHED positions only; it
 * does not poll FleetHunt itself. Staff switch focus between Orders and Devices.
 */
import "leaflet/dist/leaflet.css";
import type * as LeafletNS from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pinHtml, truckHtml } from "@/components/route-map";

interface RouteStopLite { sequence: number; type: string; name: string | null; city: string | null; lat: number; lng: number }

export interface OrderMarker {
  id: number;
  ref: string;
  customer: string;
  status: string;
  statusLabel: string;
  lat: number;
  lng: number;
  place: string | null;
  etaAt: string | null;
  distanceKm: number | null;
  deviceName: string | null;
  lastFixAt: string | null;
}
export interface DeviceMarker {
  id: number;
  name: string;
  plate: string | null;
  lat: number;
  lng: number;
  lastFixAt: string | null;
  assignedRef: string | null;
}

type View = "orders" | "devices";
const WINNIPEG: [number, number] = [49.8951, -97.1384];

const fmt = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Winnipeg",
});
const time = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : "—");
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

const STATUS_COLORS: Record<string, string> = {
  new: "#64748b",
  assigned: "#3b82f6",
  in_transit: "#e85d1c",
  delivered: "#16a34a",
  cancelled: "#ef4444",
};
/** Compact "fix 5m ago" style relative time. */
const since = (iso: string | null): string => {
  if (!iso) return "no fix yet";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "fix just now";
  if (s < 3600) return `fix ${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `fix ${Math.floor(s / 3600)}h ago`;
  return `fix ${Math.floor(s / 86400)}d ago`;
};

function StatusDot({ status, label }: { status: string; label: string }) {
  const c = STATUS_COLORS[status] ?? "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: `${c}1a`, color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

export function LiveMap({
  orders,
  devices,
  asOf,
}: {
  orders: OrderMarker[];
  devices: DeviceMarker[];
  asOf: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const LRef = useRef<typeof LeafletNS | null>(null);
  const layerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const routeLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, LeafletNS.Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("orders");
  const [selected, setSelected] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMsg, setRouteMsg] = useState<string | null>(null);

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default as unknown as typeof LeafletNS;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { center: WINNIPEG, zoom: 4, zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      LRef.current = L;
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 0);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Render markers for the active view.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    routeLayerRef.current?.clearLayers(); // switching view drops any focused route
    markersRef.current.clear();
    const pts: LeafletNS.LatLngExpression[] = [];

    if (view === "orders") {
      for (const o of orders) {
        const icon = L.divIcon({ className: "", html: truckHtml("#e85d1c"), iconSize: [30, 30], iconAnchor: [15, 15] });
        const m = L.marker([o.lat, o.lng], { icon }).bindPopup(
          `<div style="font:13px system-ui;min-width:180px">
            <div style="font-weight:600;color:#1a1a1a">${esc(o.ref)}</div>
            <div style="color:#64748b;margin-bottom:4px">${esc(o.customer)} · ${esc(o.statusLabel)}</div>
            <div><b>At:</b> ${esc(o.place ?? "—")}</div>
            <div><b>To go:</b> ${o.distanceKm != null ? `${o.distanceKm} km` : "—"}</div>
            <div><b>ETA:</b> ${time(o.etaAt)}</div>
            <div style="color:#94a3b8;margin-top:4px">${esc(o.deviceName ?? "")} · fix ${time(o.lastFixAt)}</div>
          </div>`,
        );
        m.addTo(layer);
        markersRef.current.set(`o${o.id}`, m);
        pts.push([o.lat, o.lng]);
      }
    } else {
      for (const d of devices) {
        const color = d.assignedRef ? "#2563eb" : "#64748b";
        const icon = L.divIcon({ className: "", html: truckHtml(color), iconSize: [30, 30], iconAnchor: [15, 15] });
        const m = L.marker([d.lat, d.lng], { icon }).bindPopup(
          `<div style="font:13px system-ui;min-width:170px">
            <div style="font-weight:600;color:#1a1a1a">${esc(d.name)}</div>
            <div style="color:#64748b;margin-bottom:4px">${esc(d.plate ?? "")}</div>
            <div><b>Status:</b> ${d.assignedRef ? `on ${esc(d.assignedRef)}` : "available"}</div>
            <div style="color:#94a3b8;margin-top:4px">fix ${time(d.lastFixAt)}</div>
          </div>`,
        );
        m.addTo(layer);
        markersRef.current.set(`d${d.id}`, m);
        pts.push([d.lat, d.lng]);
      }
    }

    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 9 });
  }, [ready, view, orders, devices]);

  async function focus(key: string) {
    setSelected(key);
    setRouteMsg(null);
    const m = markersRef.current.get(key);
    const map = mapRef.current;
    const L = LRef.current;
    if (m && map) {
      map.setView(m.getLatLng(), 9, { animate: true });
      m.openPopup();
    }

    // Overlay the order's route (pickup → stops → destination). Orders only.
    const routeLayer = routeLayerRef.current;
    if (!L || !map || !routeLayer) return;
    routeLayer.clearLayers();
    if (!key.startsWith("o")) return;

    // The route fetch geocodes stops + builds the road line on demand, so it can
    // take a moment — show a loader so the click feels responsive.
    setRouteLoading(true);
    try {
      const res = (await fetch(`/api/order-route?loadId=${Number(key.slice(1))}`)
        .then((r) => r.json())
        .catch(() => null)) as { stops?: RouteStopLite[]; line?: { lat: number; lng: number }[] } | null;
      const stops = res?.stops ?? [];
      if (stops.length === 0) {
        setRouteMsg("Route not available for this order yet.");
        return;
      }

      const pts: LeafletNS.LatLngExpression[] = [];

      // Road geometry if we have it; otherwise a dashed straight line through the
      // stops so the path is always visible.
      if (res?.line && res.line.length >= 2) {
        const latlngs = res.line.map((p) => [p.lat, p.lng] as [number, number]);
        L.polyline(latlngs, { color: "#2563eb", weight: 4, opacity: 0.6, lineJoin: "round" }).addTo(routeLayer);
        latlngs.forEach((c) => pts.push(c));
      } else if (stops.length >= 2) {
        const latlngs = stops.map((s) => [s.lat, s.lng] as [number, number]);
        L.polyline(latlngs, { color: "#2563eb", weight: 3, opacity: 0.5, dashArray: "6 8", lineJoin: "round" }).addTo(routeLayer);
      }

      const deliveries = stops.filter((s) => s.type === "delivery");
      const lastDeliverySeq = deliveries.length ? deliveries[deliveries.length - 1]!.sequence : -1;
      for (const s of stops) {
        const isPickup = s.type === "pickup";
        const isDest = s.sequence === lastDeliverySeq;
        const html = isPickup ? pinHtml("#16a34a", "P") : isDest ? pinHtml("#dc2626", "D") : pinHtml("#475569", String(s.sequence));
        const icon = L.divIcon({ className: "", html, iconSize: [24, 30], iconAnchor: [12, 28] });
        L.marker([s.lat, s.lng], { icon })
          .bindPopup(
            `<div style="font:13px system-ui"><b>${isPickup ? "Pickup" : isDest ? "Destination" : "Stop " + s.sequence}</b><br>${esc(s.name || s.city || "")}</div>`,
          )
          .addTo(routeLayer);
        pts.push([s.lat, s.lng]);
      }
      if (m) pts.push(m.getLatLng());
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 10 });
    } finally {
      setRouteLoading(false);
    }
  }

  const list = view === "orders" ? orders : devices;
  const tabBtn = (v: View) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      view === v ? "bg-[var(--color-secondary)] text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Focus panel */}
      <div className="card flex flex-col p-3">
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
          <button type="button" className={tabBtn("orders")} onClick={() => setView("orders")}>
            Orders <span className="opacity-70">({orders.length})</span>
          </button>
          <button type="button" className={tabBtn("devices")} onClick={() => setView("devices")}>
            Devices <span className="opacity-70">({devices.length})</span>
          </button>
        </div>

        <div className="mb-2 px-1 text-[11px] text-slate-400">
          {view === "orders"
            ? `${orders.filter((o) => o.status === "in_transit").length} in transit · ${orders.length} with a live position`
            : `${devices.filter((d) => d.assignedRef).length} on a load · ${devices.length} reporting`}
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: "calc(70vh - 110px)" }}>
          {list.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-slate-400">
              {view === "orders" ? "No active loads with a live position yet." : "No devices with a recent fix."}
            </p>
          )}
          {view === "orders" &&
            orders.map((o) => {
              const key = `o${o.id}`;
              const sel = selected === key;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => focus(key)}
                  className={`block w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    sel ? "border-[var(--color-secondary)] bg-[#fff5ef]" : "border-transparent hover:bg-[#fff5ef]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium text-slate-800">{o.ref}</span>
                    <StatusDot status={o.status} label={o.statusLabel} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{o.customer}</div>
                  {o.place && <div className="mt-1 truncate text-[11px] text-slate-400">{o.place}</div>}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                    {o.distanceKm != null && (
                      <span><span className="font-semibold text-slate-700">{o.distanceKm} km</span> to go</span>
                    )}
                    {o.etaAt && <span>ETA {time(o.etaAt)}</span>}
                  </div>
                  {(o.deviceName || o.lastFixAt) && (
                    <div className="mt-0.5 truncate text-[11px] text-slate-400">
                      {o.deviceName ? `${o.deviceName} · ` : ""}{since(o.lastFixAt)}
                    </div>
                  )}
                </button>
              );
            })}
          {view === "devices" &&
            devices.map((d) => {
              const key = `d${d.id}`;
              const sel = selected === key;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => focus(key)}
                  className={`block w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    sel ? "border-[var(--color-secondary)] bg-[#fff5ef]" : "border-transparent hover:bg-[#fff5ef]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{d.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        d.assignedRef ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${d.assignedRef ? "bg-blue-600" : "bg-slate-400"}`} />
                      {d.assignedRef ? "On load" : "Available"}
                    </span>
                  </div>
                  {d.plate && <div className="mt-0.5 truncate text-xs text-slate-500">{d.plate}</div>}
                  <div className="mt-1 truncate text-[11px] text-slate-400">
                    {d.assignedRef ? `on ${d.assignedRef} · ` : ""}{since(d.lastFixAt)}
                  </div>
                </button>
              );
            })}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-[11px] text-slate-400">
          <span>As of {asOf}</span>
          <button type="button" onClick={() => router.refresh()} className="font-medium text-[var(--color-secondary)] hover:underline">
            Refresh
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-slate-100"
        />
        {routeLoading && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-md">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--color-secondary)]" />
            Loading route…
          </div>
        )}
        {routeMsg && !routeLoading && (
          <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full border border-[var(--color-border)] bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-md">
            {routeMsg}
          </div>
        )}
      </div>
    </div>
  );
}
