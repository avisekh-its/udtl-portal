import { LOAD_STATUSES, type LoadStatus } from "@/lib/loads";
import type { ReportFilters, StopKind } from "@/lib/reports/types";

/** YYYY-MM-DD for a Date (UTC basis, matching how timestamps are stored). */
export function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Default range: the last 30 days, ending today. */
export function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  const from = ymd(new Date(now.getTime() - 29 * 86_400_000));
  return { from, to };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse report filters from URL/search params, applying safe defaults. */
export function parseReportFilters(params: Record<string, string | undefined>): ReportFilters {
  const def = defaultRange();
  const status = params.status && (LOAD_STATUSES as readonly string[]).includes(params.status)
    ? (params.status as LoadStatus)
    : "all";
  const stopType: StopKind | "all" =
    params.stopType === "pickup" || params.stopType === "delivery" ? params.stopType : "all";
  return {
    customerId: params.customer && params.customer !== "all" ? params.customer : null,
    from: params.from && DATE_RE.test(params.from) ? params.from : def.from,
    to: params.to && DATE_RE.test(params.to) ? params.to : def.to,
    status,
    stopType,
  };
}

/** Serialize filters back to a query string (for export links). */
export function filtersToQuery(f: ReportFilters): string {
  const p = new URLSearchParams();
  if (f.customerId) p.set("customer", f.customerId);
  p.set("from", f.from);
  p.set("to", f.to);
  if (f.status !== "all") p.set("status", f.status);
  if (f.stopType !== "all") p.set("stopType", f.stopType);
  return p.toString();
}
