"use client";

/**
 * Per-load route map: origin (pickup) → numbered stops → destination, plus the
 * live truck position. Plain Leaflet + free OSM tiles (markers only, no route line).
 */
import "leaflet/dist/leaflet.css";
import type * as LeafletNS from "leaflet";
import { useEffect, useRef } from "react";

export interface RouteStopMarker {
  sequence: number;
  type: string;
  name: string | null;
  city: string | null;
  region: string | null;
  lat: number;
  lng: number;
}
export interface TruckPos {
  lat: number;
  lng: number;
  place?: string | null;
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Teardrop pin with a letter/number. */
export function pinHtml(bg: string, label: string) {
  return `<div style="position:relative;width:24px;height:30px">
    <div style="position:absolute;top:0;left:0;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.35)"></div>
    <span style="position:absolute;top:3px;left:0;width:24px;text-align:center;color:#fff;font:700 11px system-ui">${label}</span>
  </div>`;
}
/** Round dot (live truck). */
export function dotHtml(color: string, ring: string) {
  return `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${ring},0 1px 3px rgba(0,0,0,.4)"></span>`;
}

export function RouteMap({ stops, truck }: { stops: RouteStopMarker[]; truck?: TruckPos | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default as unknown as typeof LeafletNS;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { center: [49.8951, -97.1384], zoom: 5, zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);
      mapRef.current = map;

      const pts: LeafletNS.LatLngExpression[] = [];
      const deliveries = stops.filter((s) => s.type === "delivery");
      const lastDeliverySeq = deliveries.length ? deliveries[deliveries.length - 1]!.sequence : -1;

      stops.forEach((s) => {
        const isPickup = s.type === "pickup";
        const isDest = s.sequence === lastDeliverySeq;
        const html = isPickup ? pinHtml("#16a34a", "P") : isDest ? pinHtml("#dc2626", "D") : pinHtml("#475569", String(s.sequence));
        const icon = L.divIcon({ className: "", html, iconSize: [24, 30], iconAnchor: [12, 28] });
        L.marker([s.lat, s.lng], { icon })
          .bindPopup(
            `<div style="font:13px system-ui"><b>${isPickup ? "Pickup" : isDest ? "Destination" : "Stop " + s.sequence}</b><br>${esc(s.name || s.city || "")}</div>`,
          )
          .addTo(map);
        pts.push([s.lat, s.lng]);
      });

      if (truck) {
        const icon = L.divIcon({ className: "", html: dotHtml("#e85d1c", "#c44c12"), iconSize: [18, 18], iconAnchor: [9, 9] });
        L.marker([truck.lat, truck.lng], { icon })
          .bindPopup(`<div style="font:13px system-ui"><b>Truck</b><br>${esc(truck.place || "Current position")}</div>`)
          .addTo(map);
        pts.push([truck.lat, truck.lng]);
      }

      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 11 });
      setTimeout(() => map.invalidateSize(), 0);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Stops/truck are fixed for a given load view; init once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[360px] w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-slate-100"
    />
  );
}
