import type { LoadStatus } from "@/lib/loads";

/**
 * Shared report types (Epic 12). Client-safe (no server-only imports) so the
 * filter bar and export links can use them too.
 */

export type StopKind = "pickup" | "delivery";

export interface ReportFilters {
  customerId: string | null; // organization id, or null = all customers
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  status: LoadStatus | "all";
  stopType: StopKind | "all";
}

export interface ReportKpis {
  onTimeDeliveryPct: number | null; // null when nothing completed to measure
  onTimePickupPct: number | null;
  onTimeOverallPct: number | null;
  completedDeliveries: number;
  completedPickups: number;
  measuredStops: number; // completed stops with a deadline (the % denominator)
  totalLoads: number;
  lateLoads: number;
  avgDelayLateLoadsMin: number | null; // mean worst-stop delay across late loads
}

export interface TrendPoint {
  label: string;
  onTimePct: number | null;
  sample: number; // measured stops in the bucket
}

export interface StatusVolume {
  status: LoadStatus;
  label: string;
  count: number;
}

/** One late stop (the exception list / detail rows). */
export interface ExceptionRow {
  loadId: number;
  ref: string;
  customer: string;
  status: string;
  stopKind: StopKind;
  stopSeq: number;
  plannedAt: string | null; // the deadline (end of window, or the single date)
  actualAt: string | null;
  delayMin: number; // minutes late (> 0)
}

export interface ReportResult {
  filters: ReportFilters;
  kpis: ReportKpis;
  trend: TrendPoint[];
  statusVolume: StatusVolume[];
  exceptions: ExceptionRow[];
  generatedAt: string;
}
