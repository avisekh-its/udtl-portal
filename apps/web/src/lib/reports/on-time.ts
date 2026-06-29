/**
 * On-time engine (Epic 12) — pure, shared by the dashboard, exports, and the
 * scheduled job. The rule (resolved per spec): a stop is on-time if its actual
 * completion is at or before the END of its planned window. Measured PER STOP —
 * every pickup and every delivery is judged individually, so a multi-stop load
 * contributes multiple data points. Stops with no actual time (not yet
 * completed) are excluded from the percentage.
 *
 * Timestamps are stored as wall-clock-UTC ('Z' appended on write), so actual
 * and planned are on the same basis and compare directly.
 */

export interface RawStop {
  type: string; // "pickup" | "delivery"
  sequence: number;
  planned_from_at: string | null;
  planned_to_at: string | null;
  actual_at: string | null;
}

/** The deadline a stop is judged against: end of the window, else the single planned date. */
export function stopDeadline(s: RawStop): string | null {
  return s.planned_to_at ?? s.planned_from_at ?? null;
}

/** A stop counts toward the % only if it's completed AND has a deadline to judge. */
export function isMeasurable(s: RawStop): boolean {
  return !!s.actual_at && !!stopDeadline(s);
}

export function isOnTime(s: RawStop): boolean {
  const d = stopDeadline(s);
  if (!s.actual_at || !d) return false;
  return new Date(s.actual_at).getTime() <= new Date(d).getTime();
}

/** Minutes late (0 if on-time or not measurable). */
export function lateMinutes(s: RawStop): number {
  const d = stopDeadline(s);
  if (!s.actual_at || !d) return 0;
  const ms = new Date(s.actual_at).getTime() - new Date(d).getTime();
  return ms > 0 ? Math.round(ms / 60_000) : 0;
}

/** Percentage on-time across measurable stops; null when there's nothing to measure. */
export function onTimePct(stops: RawStop[]): number | null {
  const measurable = stops.filter(isMeasurable);
  if (measurable.length === 0) return null;
  const onTime = measurable.filter(isOnTime).length;
  return Math.round((onTime / measurable.length) * 1000) / 10; // 1 decimal
}

/** A load's effective date for range filtering: pickup, then order, then created. */
export function loadDate(l: { pickup_date: string | null; order_date: string | null; created_at: string }): string {
  return l.pickup_date ?? l.order_date ?? l.created_at;
}

/** Human "2h 15m" / "45m" from minutes. */
export function formatDelay(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
