import Link from "next/link";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/kpi-card";
import { IconBox, IconNavigation, IconCheckCircle, IconAlertTriangle } from "@/components/icons";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { ActivityFeed, type ActivityItem } from "@/components/activity-feed";
import { MiniTable } from "@/components/mini-table";
import { StatusChip } from "@/components/status-chip";
import { LOAD_STATUS_MAP } from "@/components/status-badge";
import { LOAD_STATUSES, LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/loads";

const STATUS_COLORS: Record<LoadStatus, string> = {
  new: "#94a3b8",
  assigned: "#3b82f6",
  in_transit: "#e85d1c",
  delivered: "#16a34a",
  cancelled: "#cbd5e1",
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

interface Row {
  id: number;
  load_reference: string;
  order_number: string | null;
  status: string;
  updated_at: string;
  live_eta_at: string | null;
  metadata: { currentPlace?: string | null } | null;
  organization: { name: string } | { name: string }[] | null;
}

export default async function OpsHome() {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("loads")
    .select("id, load_reference, order_number, status, updated_at, live_eta_at, metadata, organization:organization_id ( name )")
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  const orgName = (r: Row) => one(r.organization)?.name ?? "—";
  const ref = (r: Row) => r.order_number || r.load_reference;

  // KPIs
  const inTransit = rows.filter((l) => l.status === "in_transit").length;
  const delivered = rows.filter((l) => l.status === "delivered").length;
  const active = rows.filter((l) => l.status !== "delivered" && l.status !== "cancelled").length;

  // Donut — loads by status
  const donut: DonutDatum[] = LOAD_STATUSES.map((s) => ({
    label: LOAD_STATUS_LABELS[s],
    value: rows.filter((r) => r.status === s).length,
    color: STATUS_COLORS[s],
  })).filter((d) => d.value > 0);

  // Recent activity — operational events from the audit log. Service client so
  // every staff role sees it; limited to non-sensitive load/fleethunt actions.
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
    .slice(0, 20)
    .map((a) => {
      const meta = activityMeta(a.action);
      return { id: a.id, label: meta.label, tone: meta.tone, actor: one(a.actor)?.email ?? "system", when: timeAgo(a.created_at) };
    });

  // Mini-tables
  const recent = rows.slice(0, 6);
  const transit = rows.filter((r) => r.status === "in_transit").slice(0, 6);

  const chip = (status: string) => {
    const c = LOAD_STATUS_MAP[status];
    return c ? <StatusChip label={c.label} tone={c.tone} /> : status;
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Operations</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Active loads" value={active} accent="var(--color-secondary)" icon={<IconBox />} />
        <KpiCard label="In transit" value={inTransit} accent="var(--color-accent)" icon={<IconNavigation />} />
        <KpiCard label="Delivered" value={delivered} accent="var(--color-success)" icon={<IconCheckCircle />} />
        <KpiCard label="Delayed alerts" value={0} accent="var(--color-warning)" icon={<IconAlertTriangle />} />
      </div>

      {/* Charts — equal height on desktop; activity scrolls inside the card if long */}
      <div className="grid gap-4 lg:h-[440px] lg:grid-cols-2">
        <div className="card flex flex-col p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Loads by status</h3>
          <div className="flex flex-1 items-center justify-center">
            <DonutChart data={donut} unitLabel="total loads" />
          </div>
        </div>
        <div className="card flex min-h-0 flex-col p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Recent activity</h3>
          <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
            <ActivityFeed items={activity} />
          </div>
        </div>
      </div>

      {/* Mini tables */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <MiniTable
          title="Recent loads"
          viewAllHref="/ops/loads"
          columns={[
            { key: "load", header: "Load" },
            { key: "customer", header: "Customer" },
            { key: "status", header: "Status", align: "right" },
          ]}
          rows={recent.map((r) => ({
            load: (
              <Link href={`/ops/loads/${r.id}`} className="font-mono text-[var(--color-secondary)] hover:underline">
                {ref(r)}
              </Link>
            ),
            customer: <span className="text-slate-600">{orgName(r)}</span>,
            status: chip(r.status),
          }))}
          emptyMessage="No loads yet."
        />

        <MiniTable
          title="In transit now"
          viewAllHref="/ops/map"
          viewAllLabel="Live map"
          columns={[
            { key: "load", header: "Load" },
            { key: "place", header: "Location" },
            { key: "eta", header: "ETA", align: "right" },
          ]}
          rows={transit.map((r) => ({
            load: (
              <Link href={`/ops/loads/${r.id}`} className="font-mono text-[var(--color-secondary)] hover:underline">
                {ref(r)}
              </Link>
            ),
            place: <span className="text-slate-600">{r.metadata?.currentPlace ?? "—"}</span>,
            eta: <span className="text-slate-500">{r.live_eta_at ? etaFmt.format(new Date(r.live_eta_at)) : "—"}</span>,
          }))}
          emptyMessage="Nothing in transit right now."
        />
      </div>
    </div>
  );
}
