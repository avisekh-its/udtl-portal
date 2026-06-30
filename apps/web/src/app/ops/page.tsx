import Link from "next/link";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/kpi-card";
import { IconBox, IconTruck, IconCheckCircle, IconChart } from "@/components/icons";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { ActivityFeed, type ActivityItem } from "@/components/activity-feed";
import { LOAD_STATUSES, LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/loads";

// Pill colors per status (dot + text), readable on a tinted background.
const STATUS_COLORS: Record<LoadStatus, string> = {
  new: "#64748b",
  assigned: "#3b82f6",
  in_transit: "#e85d1c",
  delivered: "#16a34a",
  cancelled: "#d64545",
};
const DONUT_COLORS: Record<LoadStatus, string> = {
  new: "#94a3b8",
  assigned: "#3b82f6",
  in_transit: "#e85d1c",
  delivered: "#16a34a",
  cancelled: "#ef4444",
};
const etaFmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Winnipeg" });
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const ACTIVITY_META: Record<string, { label: string; tone: string }> = {
  "load.created": { label: "Load created", tone: "#e85d1c" },
  "load.updated": { label: "Load updated", tone: "#e85d1c" },
  "load.status_changed": { label: "Load status changed", tone: "#16a34a" },
  "load.status_reverted": { label: "Load status reverted", tone: "#f59e0b" },
  "load.device_assigned": { label: "Tracking device assigned", tone: "#3b82f6" },
  "load.device_changed": { label: "Tracking device changed", tone: "#3b82f6" },
  "load.device_cleared": { label: "Tracking device cleared", tone: "#64748b" },
  "load.am_assigned": { label: "Account manager assigned", tone: "#8b5cf6" },
  "load.am_cleared": { label: "Account manager cleared", tone: "#64748b" },
  "load.rating_requested": { label: "Rating requested", tone: "#8b5cf6" },
  "load.rating_submitted": { label: "Rating submitted", tone: "#16a34a" },
  "load.tracking_link_created": { label: "Tracking link shared", tone: "#0891b2" },
  "fleethunt.synced": { label: "FleetHunt devices synced", tone: "#0891b2" },
};
function activityMeta(action: string) {
  return ACTIVITY_META[action] ?? { label: action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase()), tone: "#94a3b8" };
}
function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return etaFmt.format(new Date(iso));
}

interface StopLite { type: string; city: string | null; sequence: number }
interface Row {
  id: number;
  load_reference: string;
  order_number: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  live_eta_at: string | null;
  metadata: { currentPlace?: string | null } | null;
  organization: { name: string } | { name: string }[] | null;
  stops: StopLite[] | null;
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status as LoadStatus] ?? "#64748b";
  const label = LOAD_STATUS_LABELS[status as LoadStatus] ?? status;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: `${c}1a`, color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

export default async function OpsHome() {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("loads")
    .select("id, load_reference, order_number, status, created_at, updated_at, live_eta_at, metadata, organization:organization_id ( name ), stops ( type, city, sequence )")
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  const orgName = (r: Row) => one(r.organization)?.name ?? "—";
  const ref = (r: Row) => r.order_number || r.load_reference;
  const cityOf = (r: Row, type: "pickup" | "delivery") => {
    const stops = [...(r.stops ?? [])].sort((a, b) => a.sequence - b.sequence).filter((s) => s.type === type);
    return (type === "pickup" ? stops[0]?.city : stops.at(-1)?.city) ?? "—";
  };

  // KPIs
  const inTransit = rows.filter((l) => l.status === "in_transit").length;
  const delivered = rows.filter((l) => l.status === "delivered").length;
  const active = rows.filter((l) => l.status !== "delivered" && l.status !== "cancelled").length;
  const completable = delivered + active; // non-cancelled
  const inTransitPct = active > 0 ? Math.round((inTransit / active) * 100) : 0;
  const deliveredPct = completable > 0 ? Math.round((delivered / completable) * 100) : 0;

  // Total orders, month-to-date, vs the same elapsed span last month (real delta).
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const elapsed = now.getTime() - monthStart;
  const prevMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const createdAt = (r: Row) => Date.parse(r.created_at);
  const mtd = rows.filter((r) => createdAt(r) >= monthStart).length;
  const prevMtd = rows.filter((r) => {
    const t = createdAt(r);
    return t >= prevMonthStart && t <= prevMonthStart + elapsed;
  }).length;
  const ordersTrend = prevMtd > 0 ? { pct: Math.round(((mtd - prevMtd) / prevMtd) * 100), up: mtd >= prevMtd } : undefined;

  // Donut — loads by status
  const donut: DonutDatum[] = LOAD_STATUSES.map((s) => ({
    label: LOAD_STATUS_LABELS[s],
    value: rows.filter((r) => r.status === s).length,
    color: DONUT_COLORS[s],
  })).filter((d) => d.value > 0);

  // Active operations (non-delivered / non-cancelled), most-recently updated first.
  const activeOps = rows.filter((r) => r.status !== "delivered" && r.status !== "cancelled").slice(0, 6);

  // Recent activity — operational events from the audit log.
  const admin = createServiceClient();
  const { data: auditData } = await admin
    .from("audit_log")
    .select("id, action, created_at, actor:actor_user_id ( email )")
    .order("created_at", { ascending: false })
    .limit(80);
  const activity: ActivityItem[] = (
    (auditData ?? []) as unknown as {
      id: number;
      action: string;
      created_at: string;
      actor: { email: string | null } | { email: string | null }[] | null;
    }[]
  )
    .filter((a) => a.action.startsWith("load.") || a.action.startsWith("fleethunt."))
    .slice(0, 18)
    .map((a) => {
      const meta = activityMeta(a.action);
      return { id: a.id, label: meta.label, tone: meta.tone, actor: one(a.actor)?.email ?? "system", when: timeAgo(a.created_at) };
    });

  const Bar = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-600">{label}</span>
          <span className="font-semibold text-slate-800">{value} / {max}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Live view of active loads, fleet activity, and performance.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Active loads" value={active} accent="var(--color-secondary)" icon={<IconBox />} sub={`${inTransit} in transit`} />
        <KpiCard label="In transit" value={inTransit} accent="#3b82f6" icon={<IconTruck />} sub={`${inTransitPct}% of active`} />
        <KpiCard label="Delivered" value={delivered} accent="var(--color-success)" icon={<IconCheckCircle />} sub={`${deliveredPct}% of orders`} />
        <KpiCard label="Total orders (MTD)" value={mtd} accent="#475569" icon={<IconChart />} trend={ordersTrend} sub={ordersTrend ? "vs last month" : "this month"} />
      </div>

      {/* Active operations + activity feed */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Active operations</h3>
            <Link href="/ops/loads" className="text-xs font-medium text-[var(--color-secondary)] hover:underline">View all →</Link>
          </div>
          {activeOps.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No active loads right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--color-border)]">
                  {activeOps.map((r) => (
                    <tr key={r.id} className="transition hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <Link href={`/ops/loads/${r.id}`} className="font-mono font-medium text-[var(--color-secondary)] hover:underline">
                          {ref(r)}
                        </Link>
                        <div className="mt-0.5 text-xs text-slate-400">{orgName(r)}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{cityOf(r, "pickup")}</td>
                      <td className="px-3 py-3 text-slate-400">→</td>
                      <td className="px-3 py-3 text-slate-600">{cityOf(r, "delivery")}</td>
                      <td className="px-3 py-3 text-slate-500">{r.live_eta_at ? etaFmt.format(new Date(r.live_eta_at)) : "—"}</td>
                      <td className="px-5 py-3 text-right"><StatusPill status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card flex min-h-0 flex-col p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Recent activity</h3>
          <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2" style={{ maxHeight: 360 }}>
            <ActivityFeed items={activity} />
          </div>
        </div>
      </div>

      {/* Performance + status breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Fleet performance</h3>
          <div className="space-y-4">
            <Bar label="In transit" value={inTransit} max={Math.max(active, 1)} color="var(--color-secondary)" />
            <Bar label="Delivered" value={delivered} max={Math.max(completable, 1)} color="#3b82f6" />
          </div>
          <p className="mt-4 text-xs text-slate-400">Of {active} active loads, {inTransit} are moving. {delivered} of {completable} non-cancelled orders are delivered.</p>
        </div>

        <div className="card flex flex-col p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Loads by status</h3>
          <div className="flex flex-1 items-center justify-center">
            <DonutChart data={donut} unitLabel="total loads" />
          </div>
        </div>
      </div>
    </div>
  );
}
