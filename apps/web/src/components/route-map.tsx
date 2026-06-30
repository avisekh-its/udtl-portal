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

/** Modern circular pin with a clean pointer and a centered letter/number. */
export function pinHtml(bg: string, label: string) {
  return `<div style="position:relative;width:24px;height:30px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))">
    <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:22px;height:22px;border-radius:9999px;background:${bg};border:2px solid #fff;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font:700 10px system-ui;line-height:1">${label}</span>
    </div>
    <div style="position:absolute;left:50%;top:18px;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${bg}"></div>
  </div>`;
}
/** Round dot (kept for non-truck uses). */
export function dotHtml(color: string, ring: string) {
  return `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${ring},0 1px 3px rgba(0,0,0,.4)"></span>`;
}
/** Live-truck marker: a sleek filled semi-truck in a brand-orange badge. */
export function truckHtml(bg = "#e85d1c") {
  return `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:${bg};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff">
      <path d="M2 6.5c0-.55.45-1 1-1h7.5c.55 0 1 .45 1 1v7.2H2V6.5Z"/>
      <path d="M13.5 8.8h3.6c.46 0 .9.21 1.18.58l1.95 2.5c.2.26.31.58.31.9v1.42H13.5V8.8Z"/>
      <circle cx="6.6" cy="17.3" r="2.4"/><circle cx="17.2" cy="17.3" r="2.4"/>
      <circle cx="6.6" cy="17.3" r=".95" fill="${bg}"/><circle cx="17.2" cy="17.3" r=".95" fill="${bg}"/>
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
        const icon = L.divIcon({ className: "", html: truckHtml("#e85d1c"), iconSize: [30, 30], iconAnchor: [15, 15] });
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
