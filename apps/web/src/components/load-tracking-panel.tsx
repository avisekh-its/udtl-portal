"use client";

/**
 * Live tracking summary for a load (consumes the Epic-4 data layer).
 * Auto-refreshes every ~30s from OUR cached data via /api/load-tracking —
 * zero FleetHunt cost (FR-TRACK-002) and no manual page reload needed.
 * This is NOT the map — the map UI is Epics 5/7.
 */
import { useEffect, useRef, useState } from "react";

const fmtTime = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Winnipeg",
});

export interface LoadTracking {
  loadId?: number;
  hasDevice: boolean;
  deviceName?: string | null;
  hasGateway?: boolean;
  lastFixAt?: string | null;
  place?: string | null;
  distanceKm?: number | null;
  etaAt?: string | null;
  /** Poll cadence in ms (default 30s). */
  pollMs?: number;
}

interface LiveState {
  place: string | null;
  distanceKm: number | null;
  etaAt: string | null;
  lastFixAt: string | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

/** Compact "just now / 45s ago / 3m ago" for the refresh ticker. */
function agoLabel(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const s = Math.max(0, (nowMs - new Date(iso).getTime()) / 1000);
  if (s < 30) return "just now";
  if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export function LoadTrackingPanel(t: LoadTracking) {
  const [live, setLive] = useState<LiveState>({
    place: t.place ?? null,
    distanceKm: t.distanceKm ?? null,
    etaAt: t.etaAt ?? null,
    lastFixAt: t.lastFixAt ?? null,
  });
  const [flash, setFlash] = useState(false);
  // `now` is set only after mount so SSR and hydration render identically.
  const [now, setNow] = useState<number | null>(null);
  const prevRef = useRef("");

  const pollable = !!t.loadId && t.hasDevice && t.hasGateway !== false;

  useEffect(() => {
    if (!pollable) return;
    let cancelled = false;

    async function tick() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/load-tracking?loadId=${t.loadId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const d = (await res.json()) as LiveState;
        const key = `${d.place}|${d.distanceKm}|${d.etaAt}|${d.lastFixAt}`;
        if (prevRef.current && prevRef.current !== key) {
          setFlash(true);
          setTimeout(() => setFlash(false), 1600);
        }
        prevRef.current = key;
        setLive(d);
      } catch {
        /* transient — keep showing last data */
      }
    }

    prevRef.current = `${live.place}|${live.distanceKm}|${live.etaAt}|${live.lastFixAt}`;
    const interval = setInterval(tick, t.pollMs ?? 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    // First check shortly after mount (catches a poll that landed since SSR).
    const kick = setTimeout(tick, 3_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(kick);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollable, t.loadId, t.pollMs]);

  // Refresh-age ticker (client-only to avoid hydration mismatch).
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  let body: React.ReactNode;

  if (!t.hasDevice) {
    body = <p className="text-sm text-slate-500">No tracking device assigned to this load yet.</p>;
  } else if (t.hasGateway === false) {
    body = (
      <p className="text-sm text-[var(--color-warning)]">
        Live position not available — {t.deviceName ?? "this device"} has no GPS gateway.
      </p>
    );
  } else if (!live.lastFixAt) {
    // Professional waiting state: radar pulse + bouncing dots, auto-resolves
    // without a reload once the poll caches the first position.
    body = (
      <div className="flex items-center gap-4 py-1">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-secondary)]/25" />
          <span className="absolute inline-flex h-6 w-6 animate-ping rounded-full bg-[var(--color-secondary)]/30 [animation-delay:300ms]" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--color-secondary)]" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-700">
            Locating {t.deviceName ?? "the device"}
            <span className="inline-flex w-6 justify-start">
              <span className="animate-bounce">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Waiting for the first GPS fix — updates automatically, usually under a minute.
          </p>
        </div>
      </div>
    );
  } else {
    body = (
      <div
        className={`space-y-3 rounded-lg transition-colors duration-700 ${flash ? "bg-[var(--color-secondary)]/8 p-2 -m-2" : ""}`}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Current position" value={live.place ?? "—"} />
          <Stat label="Distance to go" value={live.distanceKm != null ? `${live.distanceKm} km` : "—"} />
          <Stat label="Live ETA" value={live.etaAt ? fmtTime.format(new Date(live.etaAt)) : "—"} />
        </div>
        <p className="text-xs text-slate-400">
          Last fix {fmtTime.format(new Date(live.lastFixAt))}
          {now && ` (${agoLabel(live.lastFixAt, now)})`} · auto-refreshes every {(t.pollMs ?? 30_000) / 1000}s.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        {pollable && live.lastFixAt ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-success)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-success)]" />
          </span>
        ) : (
          <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
        )}
        <h2 className="text-sm font-semibold text-slate-800">Live tracking</h2>
        {pollable && live.lastFixAt && (
          <span className="rounded-full bg-[var(--color-success)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-success)]">
            Live
          </span>
        )}
        {t.deviceName && <span className="text-xs text-slate-400">· {t.deviceName}</span>}
      </div>
      {body}
    </div>
  );
}
