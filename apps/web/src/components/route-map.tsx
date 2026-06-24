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
/** Round dot (kept for non-truck uses). */
export function dotHtml(color: string, ring: string) {
  return `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${ring},0 1px 3px rgba(0,0,0,.4)"></span>`;
}
/** Live-truck marker: a truck glyph in a brand-orange badge. */
export function truckHtml(bg = "#e85d1c") {
  return `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${bg};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/>
      <circle cx="7.5" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>
    </svg>
  </div>`;
}

export function RouteMap({
  stops,
  truck,
  line,
}: {
  stops: RouteStopMarker[];
  truck?: TruckPos | null;
  /** Road geometry [{lat,lng}…] to draw as the route line. */
  line?: { lat: number; lng: number }[];
}) {
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

      // Route line (drawn first so the pins sit on top).
      if (line && line.length >= 2) {
        const latlngs = line.map((p) => [p.lat, p.lng] as [number, number]);
        L.polyline(latlngs, { color: "#2563eb", weight: 4, opacity: 0.6, lineJoin: "round" }).addTo(map);
        latlngs.forEach((c) => pts.push(c));
      }

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
        const icon = L.divIcon({ className: "", html: truckHtml("#e85d1c"), iconSize: [28, 28], iconAnchor: [14, 14] });
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
