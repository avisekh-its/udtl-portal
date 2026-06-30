/**
 * Lightweight SVG donut (no chart lib). Server-renderable, responsive via viewBox.
 * Rounded segment caps, total in the center, and a 2-column percentage legend.
 */
export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  data,
  unitLabel = "total",
  size = 184,
}: {
  data: DonutDatum[];
  unitLabel?: string;
  size?: number;
}) {
  const sum = data.reduce((a, d) => a + d.value, 0);
  const sw = 18;
  const r = (size - sw) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" role="img" aria-label="Loads by status">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={sw} />
          {sum > 0 &&
            data.map((d, i) => {
              const len = (d.value / sum) * C;
              const el = (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums text-slate-900">{sum.toLocaleString("en-CA")}</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">{unitLabel}</span>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-slate-400">No data yet.</p>
      ) : (
        <ul className="grid w-full max-w-xs grid-cols-2 gap-x-6 gap-y-2.5">
          {data.map((d, i) => {
            const pct = sum ? Math.round((d.value / sum) * 100) : 0;
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                <span className="truncate text-slate-500">
                  <span className="font-semibold text-slate-800">{pct}%</span> {d.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
