/** Top-line metric card for dashboards — branded accent bar, icon, large figure,
 *  with an optional delta chip and/or a small context sub-line. */
export function KpiCard({
  label,
  value,
  accent = "var(--color-secondary)",
  icon,
  trend,
  sub,
}: {
  label: string;
  value: number | string;
  accent?: string;
  icon?: React.ReactNode;
  /** Period-over-period change. up=green, down=red. */
  trend?: { pct: number; up: boolean };
  /** Small muted context line, e.g. "4 in transit". */
  sub?: string;
}) {
  const shown = typeof value === "number" ? value.toLocaleString("en-CA") : value;
  return (
    <div className="card relative overflow-hidden p-5">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-[32px] font-semibold leading-none tabular-nums text-slate-900">{shown}</span>
            {trend && (
              <span className={`text-xs font-semibold ${trend.up ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                {trend.up ? "↑" : "↓"}{Math.abs(trend.pct)}%
              </span>
            )}
            {sub && <span className="truncate text-xs text-slate-400">{sub}</span>}
          </div>
        </div>
        {icon && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, white)`, color: accent }}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
