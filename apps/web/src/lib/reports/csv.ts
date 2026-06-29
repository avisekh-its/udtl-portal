import { formatDelay } from "@/lib/reports/on-time";
import type { ReportResult } from "@/lib/reports/types";

/** Build a performance-report CSV: a filter+KPI header block, then the late-stop rows. */
export function buildReportCsv(result: ReportResult, customerName: string): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const row = (...cells: unknown[]) => cells.map(esc).join(",");
  const pct = (v: number | null) => (v == null ? "n/a" : `${v}%`);
  const f = result.filters;
  const k = result.kpis;

  const lines: string[] = [];
  lines.push(row("UDTL Performance Report"));
  lines.push(row("Customer", customerName));
  lines.push(row("Date range", `${f.from} to ${f.to}`));
  lines.push(row("Status filter", f.status));
  lines.push(row("Stop-type filter", f.stopType));
  lines.push(row("Generated", result.generatedAt));
  lines.push("");
  lines.push(row("On-time delivery %", pct(k.onTimeDeliveryPct)));
  lines.push(row("On-time pickup %", pct(k.onTimePickupPct)));
  lines.push(row("On-time overall %", pct(k.onTimeOverallPct)));
  lines.push(row("Loads in range", k.totalLoads));
  lines.push(row("Measured stops", k.measuredStops));
  lines.push(row("Late loads", k.lateLoads));
  lines.push(row("Avg delay (late loads)", formatDelay(k.avgDelayLateLoadsMin)));
  lines.push("");
  lines.push(row("Volume by status"));
  for (const v of result.statusVolume) lines.push(row(v.label, v.count));
  lines.push("");
  lines.push(row("Late stop exceptions"));
  lines.push(row("Load", "Customer", "Status", "Stop", "Seq", "Planned (deadline)", "Actual", "Delay"));
  for (const e of result.exceptions) {
    lines.push(
      row(e.ref, e.customer, e.status, e.stopKind, e.stopSeq, e.plannedAt ?? "", e.actualAt ?? "", formatDelay(e.delayMin)),
    );
  }
  if (result.exceptions.length === 0) lines.push(row("No late stops in this period."));

  return lines.join("\n");
}
