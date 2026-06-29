import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { KpiCard } from "@/components/kpi-card";
import { IconCheckCircle, IconNavigation, IconClock, IconAlertTriangle } from "@/components/icons";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { VerticalBarChart } from "@/components/charts/vertical-bar-chart";
import { StatusChip } from "@/components/status-chip";
import { LOAD_STATUS_MAP } from "@/components/status-badge";
import { type LoadStatus } from "@/lib/loads";
import { computeReport, reportCustomers } from "@/lib/reports/compute";
import { parseReportFilters } from "@/lib/reports/filters";
import { formatDelay } from "@/lib/reports/on-time";
import { ReportFilterBar } from "./report-filters";

const STATUS_COLORS: Record<LoadStatus, string> = {
  new: "#94a3b8",
  assigned: "#3b82f6",
  in_transit: "#e85d1c",
  delivered: "#16a34a",
  cancelled: "#cbd5e1",
};
const dtFmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Winnipeg" });
const dt = (iso: string | null) => (iso ? dtFmt.format(new Date(iso)) : "—");
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

/** UDTL-only performance dashboard (Epic 12). Gated to staff via view_reports. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireCapability("view_reports");
  const params = await searchParams;
  const filters = parseReportFilters(params);
  const [customers, result] = await Promise.all([reportCustomers(), computeReport(filters)]);
  const customerName = filters.customerId
    ? (customers.find((c) => c.id === filters.customerId)?.name ?? "Unknown customer")
    : "All customers";

  const k = result.kpis;
  const donut: DonutDatum[] = result.statusVolume.map((v) => ({
    label: v.label,
    value: v.count,
    color: STATUS_COLORS[v.status],
  }));
  const trend = result.trend.map((t) => ({ label: t.label, value: t.onTimePct ?? 0 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Performance</h1>
        <p className="mt-1 text-sm text-slate-500">
          On-time performance by customer and date range. A stop is on-time when it&apos;s completed at or before the
          end of its planned window; each pickup and delivery is measured individually.
        </p>
      </div>

      <ReportFilterBar customers={customers} filters={filters} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="On-time delivery" value={pct(k.onTimeDeliveryPct)} accent="var(--color-success)" icon={<IconCheckCircle />} />
        <KpiCard label="On-time pickup" value={pct(k.onTimePickupPct)} accent="var(--color-secondary)" icon={<IconNavigation />} />
        <KpiCard label="Avg delay (late loads)" value={formatDelay(k.avgDelayLateLoadsMin)} accent="var(--color-warning)" icon={<IconClock />} />
        <KpiCard label="Late loads" value={k.lateLoads} accent="var(--color-error)" icon={<IconAlertTriangle />} />
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        {customerName} · {result.filters.from} → {result.filters.to} · {k.totalLoads} loads · {k.measuredStops} measured
        stops · on-time overall <strong className="text-slate-700">{pct(k.onTimeOverallPct)}</strong>
      </p>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex flex-col p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Volume by status</h3>
          <div className="flex flex-1 items-center justify-center">
            <DonutChart data={donut} unitLabel="loads in range" />
          </div>
        </div>
        <div className="card flex flex-col p-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">On-time trend</h3>
          <p className="mb-4 text-xs text-slate-400">% of measured stops on-time per period</p>
          <div className="flex flex-1 items-center justify-center">
            {trend.length ? <VerticalBarChart data={trend} /> : <p className="py-10 text-sm text-slate-400">No completed stops in range.</p>}
          </div>
        </div>
      </div>

      {/* Exception list */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Late-load exceptions ({result.exceptions.length})</h3>
        </div>
        {result.exceptions.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No late stops in this period. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-medium">Load</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Stop</th>
                  <th className="px-3 py-2.5 font-medium">Planned</th>
                  <th className="px-3 py-2.5 font-medium">Actual</th>
                  <th className="px-3 py-2.5 text-right font-medium">Delay</th>
                  <th className="px-5 py-2.5 text-right font-medium">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.exceptions.map((e, i) => {
                  const c = LOAD_STATUS_MAP[e.status];
                  return (
                    <tr key={`${e.loadId}-${e.stopKind}-${e.stopSeq}-${i}`} className="hover:bg-slate-50/60">
                      <td className="px-5 py-2.5">
                        <Link href={`/ops/loads/${e.loadId}`} className="font-mono text-[var(--color-secondary)] hover:underline">
                          {e.ref}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{e.customer}</td>
                      <td className="px-3 py-2.5">{c ? <StatusChip label={c.label} tone={c.tone} /> : e.status}</td>
                      <td className="px-3 py-2.5 capitalize text-slate-600">{e.stopKind} #{e.stopSeq}</td>
                      <td className="px-3 py-2.5 text-slate-500">{dt(e.plannedAt)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{dt(e.actualAt)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-[var(--color-error)]">{formatDelay(e.delayMin)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <a href={`/api/reports/order-summary/${e.loadId}`} className="text-xs font-medium text-[var(--color-secondary)] hover:underline">
                          Summary
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
