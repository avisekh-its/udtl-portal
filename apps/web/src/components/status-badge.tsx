import type { StatusMap } from "@/components/status-chip";

/**
 * Load status chip. Color language per the design system:
 *   New = gray · Assigned = blue · In Transit = teal · Delivered = green · Cancelled = red
 */
type LoadStatus = "new" | "assigned" | "in_transit" | "delivered" | "cancelled";

/** DataTable-compatible map for load status columns. */
export const LOAD_STATUS_MAP: StatusMap = {
  new: { label: "New", tone: "neutral" },
  assigned: { label: "Assigned", tone: "info" },
  in_transit: { label: "In Transit", tone: "accent" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "error" },
};

const STYLES: Record<LoadStatus, { label: string; dot: string; chip: string }> = {
  new: { label: "New", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600" },
  assigned: { label: "Assigned", dot: "bg-[#2f6b9a]", chip: "bg-[#2f6b9a]/10 text-[#2f6b9a]" },
  in_transit: { label: "In Transit", dot: "bg-[#e85d1c]", chip: "bg-[#e85d1c]/12 text-[#b8480f]" },
  delivered: { label: "Delivered", dot: "bg-[#2e9e5b]", chip: "bg-[#2e9e5b]/12 text-[#247d49]" },
  cancelled: { label: "Cancelled", dot: "bg-[#d64545]", chip: "bg-[#d64545]/10 text-[#d64545]" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status as LoadStatus] ?? STYLES.new;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
