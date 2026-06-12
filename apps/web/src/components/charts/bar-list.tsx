/**
 * Ranked bar widget (CSS bars, no chart lib) in UDTL's orange theme. Good for
 * ranked categories such as loads-per-customer. Responsive: bars fill width.
 */
export interface BarDatum {
  label: string;
  value: number;
}

export function BarList({ data, valueSuffix = "" }: { data: BarDatum[]; valueSuffix?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No data yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {data.map((d, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)]/10 text-xs font-semibold text-[var(--color-secondary)]">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium text-slate-700">{d.label}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {d.value}
                {valueSuffix}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(6, (d.value / max) * 100)}%`,
                  background: "linear-gradient(90deg, var(--color-secondary-700), var(--color-secondary))",
                }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
