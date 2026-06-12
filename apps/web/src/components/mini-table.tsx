import Link from "next/link";

/** Compact dashboard table (card + header + small rows). Cells accept ReactNodes
 *  so you can drop in status chips, links, etc. */
export interface MiniColumn {
  key: string;
  header: string;
  align?: "left" | "right";
}

export function MiniTable({
  title,
  viewAllHref,
  viewAllLabel = "View all",
  columns,
  rows,
  emptyMessage = "Nothing yet.",
}: {
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  columns: MiniColumn[];
  rows: Record<string, React.ReactNode>[];
  emptyMessage?: string;
}) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs font-medium text-[var(--color-secondary)] hover:underline">
            {viewAllLabel} →
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="flex-1 px-5 py-10 text-center text-sm text-slate-400">{emptyMessage}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-400">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-5 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((r, i) => (
              <tr key={i} className="transition hover:bg-[#fff5ef]">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-5 py-2.5 ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
