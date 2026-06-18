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
import { pinHtml } from "@/components/route-map";

interface RouteStopLite { sequence: number; type: string; name: string | null; city: string | null; lat: number; lng: number }

export interface OrderMarker {
  id: number;
  ref: string;
  customer: string;
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

function dot(color: string, ring: string) {
  return `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1.5px ${ring},0 1px 3px rgba(0,0,0,.4)"></span>`;
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
        const icon = L.divIcon({ className: "", html: dot("#e85d1c", "#c44c12"), iconSize: [16, 16], iconAnchor: [8, 8] });
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
        const icon = L.divIcon({ className: "", html: dot(color, "#1e293b"), iconSize: [16, 16], iconAnchor: [8, 8] });
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

    const res = (await fetch(`/api/order-route?loadId=${Number(key.slice(1))}`)
      .then((r) => r.json())
      .catch(() => null)) as { stops?: RouteStopLite[]; line?: { lat: number; lng: number }[] } | null;
    const stops = res?.stops;
    if (!stops || stops.length === 0) return;

    const pts: LeafletNS.LatLngExpression[] = [];

    // Route line (under the pins).
    if (res?.line && res.line.length >= 2) {
      const latlngs = res.line.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(latlngs, { color: "#2563eb", weight: 4, opacity: 0.6, lineJoin: "round" }).addTo(routeLayer);
      latlngs.forEach((c) => pts.push(c));
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
  }

  const list = view === "orders" ? orders : devices;
  const tabBtn = (v: View) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      view === v ? "bg-[var(--color-secondary)] text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
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

        <div className="flex-1 space-y-1 overflow-y-auto" style={{ maxHeight: "calc(70vh - 90px)" }}>
          {list.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-slate-400">
              {view === "orders" ? "No active loads with a live position yet." : "No devices with a recent fix."}
            </p>
          )}
          {view === "orders" &&
            orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => focus(`o${o.id}`)}
                className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-[#fff5ef]"
              >
                <div className="text-sm font-medium text-slate-800">{o.ref}</div>
                <div className="truncate text-xs text-slate-500">{o.place ?? o.customer}</div>
              </button>
            ))}
          {view === "devices" &&
            devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => focus(`d${d.id}`)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-[#fff5ef]"
              >
                <div>
                  <div className="text-sm font-medium text-slate-800">{d.name}</div>
                  <div className="truncate text-xs text-slate-500">{d.assignedRef ? `on ${d.assignedRef}` : "available"}</div>
                </div>
                <span className={`h-2 w-2 rounded-full ${d.assignedRef ? "bg-blue-600" : "bg-slate-400"}`} />
              </button>
            ))}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-[11px] text-slate-400">
          <span>As of {asOf}</span>
          <button type="button" onClick={() => router.refresh()} className="font-medium text-[var(--color-secondary)] hover:underline">
            Refresh
          </button>
        </div>
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-slate-100"
      />
    </div>
  );
}
