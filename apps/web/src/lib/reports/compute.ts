import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { LOAD_STATUSES, LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/loads";
import {
  isMeasurable,
  isOnTime,
  lateMinutes,
  loadDate,
  onTimePct,
  stopDeadline,
  type RawStop,
} from "@/lib/reports/on-time";
import type { ExceptionRow, ReportFilters, ReportResult, StatusVolume, TrendPoint } from "@/lib/reports/types";

const MAX_LOADS = 5000; // safety cap; logged in the UI if hit
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface LoadRow {
  id: number;
  load_reference: string;
  order_number: string | null;
  status: string;
  pickup_date: string | null;
  order_date: string | null;
  created_at: string;
  organization: { name: string } | { name: string }[] | null;
  stops: RawStop[] | null;
}

export interface ReportCustomer {
  id: string;
  name: string;
}

/** Active customer organizations for the filter dropdown. */
export async function reportCustomers(): Promise<ReportCustomer[]> {
  const admin = createServiceClient();
  const { data } = await admin.from("organizations").select("id, name").eq("active", true).order("name");
  return (data ?? []).map((o) => ({ id: o.id as string, name: o.name as string }));
}

function rangeBounds(from: string, to: string): { fromMs: number; toMs: number } {
  // Stored timestamps are wall-clock-UTC, so treat the picked dates as UTC too.
  return {
    fromMs: Date.parse(`${from}T00:00:00Z`),
    toMs: Date.parse(`${to}T23:59:59Z`),
  };
}

type Gran = "day" | "week" | "month";
function granularity(fromMs: number, toMs: number): Gran {
  const days = (toMs - fromMs) / 86_400_000;
  if (days <= 31) return "day";
  if (days <= 168) return "week";
  return "month";
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const monFmt = new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });

function bucketOf(iso: string, gran: Gran): { key: string; label: string; sort: number } {
  const d = new Date(iso);
  if (gran === "month") {
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return { key: k, label: monFmt.format(new Date(first)), sort: first };
  }
  if (gran === "week") {
    const offset = (d.getUTCDay() + 6) % 7; // days since Monday
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset);
    return { key: String(monday), label: dayFmt.format(new Date(monday)), sort: monday };
  }
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { key: String(day), label: dayFmt.format(new Date(day)), sort: day };
}

/**
 * Compute every KPI, the trend, the status volume, and the late-stop exception
 * list for the given filters. Customer + date range drive the headline cohort;
 * the status and stop-type filters additionally scope the KPIs/exceptions
 * (status volume always shows the full status mix for the customer + range).
 */
export async function computeReport(filters: ReportFilters): Promise<ReportResult> {
  const admin = createServiceClient();
  let q = admin
    .from("loads")
    .select(
      "id, load_reference, order_number, status, pickup_date, order_date, created_at, organization:organization_id ( name ), stops ( type, sequence, planned_from_at, planned_to_at, actual_at )",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_LOADS);
  if (filters.customerId) q = q.eq("organization_id", filters.customerId);
  const { data } = await q;
  const rows = (data ?? []) as unknown as LoadRow[];

  const { fromMs, toMs } = rangeBounds(filters.from, filters.to);
  const ref = (l: LoadRow) => l.order_number || l.load_reference;
  const orgName = (l: LoadRow) => one(l.organization)?.name ?? "—";
  const stopsOf = (l: LoadRow) =>
    (l.stops ?? []).filter((s) => filters.stopType === "all" || s.type === filters.stopType);

  // Range cohort (customer already applied at the DB).
  const inRange = rows.filter((l) => {
    const t = Date.parse(loadDate(l));
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  });

  // Status volume — full mix for customer + range (ignores the status filter).
  const statusVolume: StatusVolume[] = LOAD_STATUSES.map((s) => ({
    status: s,
    label: LOAD_STATUS_LABELS[s],
    count: inRange.filter((l) => l.status === s).length,
  })).filter((d) => d.count > 0);

  // KPI/exception cohort additionally honors the status filter.
  const cohort = filters.status === "all" ? inRange : inRange.filter((l) => l.status === filters.status);

  const deliveryStops: RawStop[] = [];
  const pickupStops: RawStop[] = [];
  const exceptions: ExceptionRow[] = [];
  let lateLoads = 0;
  let delaySum = 0;

  const gran = granularity(fromMs, toMs);
  const buckets = new Map<string, { label: string; sort: number; on: number; n: number }>();

  for (const l of cohort) {
    const stops = stopsOf(l);
    let worstDelay = 0;
    for (const s of stops) {
      if (s.type === "delivery") deliveryStops.push(s);
      else if (s.type === "pickup") pickupStops.push(s);

      if (isMeasurable(s)) {
        const b = bucketOf(loadDate(l), gran);
        const cur = buckets.get(b.key) ?? { label: b.label, sort: b.sort, on: 0, n: 0 };
        cur.n += 1;
        if (isOnTime(s)) cur.on += 1;
        buckets.set(b.key, cur);
      }

      const late = lateMinutes(s);
      if (late > 0) {
        worstDelay = Math.max(worstDelay, late);
        exceptions.push({
          loadId: l.id,
          ref: ref(l),
          customer: orgName(l),
          status: l.status,
          stopKind: s.type === "pickup" ? "pickup" : "delivery",
          stopSeq: s.sequence,
          plannedAt: stopDeadline(s),
          actualAt: s.actual_at,
          delayMin: late,
        });
      }
    }
    if (worstDelay > 0) {
      lateLoads += 1;
      delaySum += worstDelay;
    }
  }

  const measuredStops = [...deliveryStops, ...pickupStops].filter(isMeasurable).length;
  const trend: TrendPoint[] = [...buckets.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((b) => ({ label: b.label, onTimePct: b.n ? Math.round((b.on / b.n) * 1000) / 10 : null, sample: b.n }));

  exceptions.sort((a, b) => b.delayMin - a.delayMin);

  return {
    filters,
    kpis: {
      onTimeDeliveryPct: onTimePct(deliveryStops),
      onTimePickupPct: onTimePct(pickupStops),
      onTimeOverallPct: onTimePct([...deliveryStops, ...pickupStops]),
      completedDeliveries: deliveryStops.filter(isMeasurable).length,
      completedPickups: pickupStops.filter(isMeasurable).length,
      measuredStops,
      totalLoads: cohort.length,
      lateLoads,
      avgDelayLateLoadsMin: lateLoads ? Math.round(delaySum / lateLoads) : null,
    },
    trend,
    statusVolume,
    exceptions,
    generatedAt: new Date().toISOString(),
  };
}
