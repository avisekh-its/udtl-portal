/** Top-line metric card for dashboards — branded accent bar, icon, large figure. */
export function KpiCard({
  label,
  value,
  accent = "var(--color-secondary)",
  icon,
}: {
  label: string;
  value: number | string;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card relative overflow-hidden p-5">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </span>
          <div className="mt-2.5 text-[28px] font-semibold leading-none tabular-nums text-slate-900">
            {value}
          </div>
        </div>
        {icon && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 12%, white)`,
              color: accent,
            }}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
