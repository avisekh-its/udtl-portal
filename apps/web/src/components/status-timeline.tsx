/** Vertical status timeline (read-only) — shipment lifecycle for the order detail. */
export interface TimelineEvent {
  label: string;
  at: string;
  tone?: string;
  note?: string;
}

export function StatusTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-400">No status updates yet.</p>;
  }
  return (
    <ol className="relative ml-1 space-y-4 border-l border-[var(--color-border)] pl-5">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span
            className="absolute -left-[1.45rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white"
            style={{ background: e.tone ?? "#94a3b8" }}
          />
          <div className="text-sm font-medium text-slate-800">{e.label}</div>
          <div className="text-xs text-slate-400">{e.at}</div>
          {e.note && <div className="mt-0.5 text-xs text-slate-500">{e.note}</div>}
        </li>
      ))}
    </ol>
  );
}
