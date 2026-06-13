/** Compact recent-activity list for the dashboard (server-rendered). */
export interface ActivityItem {
  id: number;
  label: string;
  actor: string;
  when: string;
  tone: string;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">No recent activity yet.</p>;
  }
  return (
    <ul className="-my-1 divide-y divide-[var(--color-border)]">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-2.5">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: a.tone }} />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-700">{a.label}</div>
            <div className="truncate text-xs text-slate-400">
              {a.actor} · {a.when}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
