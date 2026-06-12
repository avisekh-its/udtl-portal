/**
 * Vertical bar / column chart (CSS, no chart lib) in UDTL's orange theme.
 * Value labels above each column, category labels below a baseline. Responsive.
 */
export interface VBarDatum {
  label: string;
  value: number;
}

const PLOT = 172; // column plot-area height (px)
const BAR_MAX = 140; // tallest bar height (leaves room for the value label)

// A distinct color per column (UDTL orange leads, then complementary theme tones).
const BAR_COLORS: [string, string][] = [
  ["#f1763c", "#e85d1c"],
  ["#5b9bf6", "#3b82f6"],
  ["#2dd4bf", "#14b8a6"],
  ["#fbbf52", "#f59e0b"],
  ["#a78bfa", "#8b5cf6"],
  ["#38bdf8", "#0ea5e9"],
];

export function VerticalBarChart({ data }: { data: VBarDatum[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">No data yet.</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div>
      <div className="flex items-end justify-around gap-6" style={{ height: PLOT }}>
        {data.map((d, i) => {
          const [top, bottom] = BAR_COLORS[i % BAR_COLORS.length]!;
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
              <span className="mb-1.5 text-sm font-semibold tabular-nums text-slate-700">{d.value}</span>
              <div
                className="w-full max-w-[72px] rounded-t-lg transition-all"
                style={{
                  height: `${Math.max(6, (d.value / max) * BAR_MAX)}px`,
                  background: `linear-gradient(180deg, ${top}, ${bottom})`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-around gap-6 border-t border-[var(--color-border)] pt-2">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-xs text-slate-500">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
