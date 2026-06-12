/**
 * Live tracking summary for a load (consumes the Epic-4 data layer).
 * This is NOT the map — the map UI is Epics 5/7. It shows position / ETA /
 * distance / place, with graceful degradation messaging.
 */
const fmtTime = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Winnipeg",
});

export interface LoadTracking {
  hasDevice: boolean;
  deviceName?: string | null;
  hasGateway?: boolean;
  lastFixAt?: string | null;
  place?: string | null;
  distanceKm?: number | null;
  etaAt?: string | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

export function LoadTrackingPanel(t: LoadTracking) {
  let body: React.ReactNode;

  if (!t.hasDevice) {
    body = <p className="text-sm text-slate-500">No tracking device assigned to this load yet.</p>;
  } else if (t.hasGateway === false) {
    body = (
      <p className="text-sm text-[var(--color-warning)]">
        Live position not available — {t.deviceName ?? "this device"} has no GPS gateway.
      </p>
    );
  } else if (!t.lastFixAt) {
    body = <p className="text-sm text-slate-500">Waiting for the first position from {t.deviceName ?? "the device"}…</p>;
  } else {
    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Current position" value={t.place ?? "—"} />
          <Stat label="Distance to go" value={t.distanceKm != null ? `${t.distanceKm} km` : "—"} />
          <Stat label="Live ETA" value={t.etaAt ? fmtTime.format(new Date(t.etaAt)) : "—"} />
        </div>
        <p className="text-xs text-slate-400">
          Last fix {fmtTime.format(new Date(t.lastFixAt))} · refreshes as the device moves.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
        <h2 className="text-sm font-semibold text-slate-800">Live tracking</h2>
        {t.deviceName && <span className="text-xs text-slate-400">· {t.deviceName}</span>}
      </div>
      {body}
    </div>
  );
}
