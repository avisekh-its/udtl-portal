/**
 * Lightweight SVG donut (no chart lib). Server-renderable, responsive via viewBox.
 * Layout: donut centered with the total in the middle, a compact legend below it
 * (no side whitespace, no percentages).
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
  const sw = 20;
  const r = (size - sw) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5">
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
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums text-slate-900">{sum}</span>
          <span className="mt-0.5 text-xs text-slate-400">{unitLabel}</span>
        </div>
      </div>

      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {data.length === 0 && <li className="text-sm text-slate-400">No data yet.</li>}
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="text-slate-600">{d.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
