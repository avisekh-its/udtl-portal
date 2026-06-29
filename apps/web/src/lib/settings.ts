/**
 * App settings (key/value) helpers — FRD §18 #5 (cost visibility), and the home
 * for future toggles (digest times, etc.). Reads/writes via the service client.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export const SETTING_COST_VISIBLE = "cost_visible_to_customers";
export const SETTING_DIGEST_TIMES = "digest_times";
export const SETTING_REPORT_SCHEDULE = "report_schedule";
export const SETTING_REPORT_LAST_SENT = "report_schedule_last_sent";

/** Weekly performance-report email config (Epic 12). day: 0=Sun … 6=Sat. */
export interface ReportSchedule {
  enabled: boolean;
  day: number; // 0–6
  time: string; // "HH:MM" America/Winnipeg
  recipients: string[];
}
const DEFAULT_REPORT_SCHEDULE: ReportSchedule = { enabled: false, day: 1, time: "07:00", recipients: [] };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const admin = createServiceClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", key).single();
  return (data?.value ?? fallback) as T;
}

export async function setSetting(key: string, value: unknown, userId: string | null): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId });
}

/** Whether per-load cost is shown to customers (default true per Meeting 2). */
export async function isCostVisibleToCustomers(): Promise<boolean> {
  return getSetting<boolean>(SETTING_COST_VISIBLE, true);
}

/** Twice-daily digest send times, "HH:MM" in America/Winnipeg (default 08:00 & 16:00). */
export async function getDigestTimes(): Promise<string[]> {
  const v = await getSetting<string[]>(SETTING_DIGEST_TIMES, ["08:00", "16:00"]);
  return Array.isArray(v) && v.length ? v : ["08:00", "16:00"];
}

export async function setDigestTimes(times: string[], userId: string | null): Promise<void> {
  return setSetting(SETTING_DIGEST_TIMES, times, userId);
}

/** Weekly performance-report email schedule (Epic 12). */
export async function getReportSchedule(): Promise<ReportSchedule> {
  const v = await getSetting<ReportSchedule | null>(SETTING_REPORT_SCHEDULE, null);
  if (!v || typeof v !== "object") return DEFAULT_REPORT_SCHEDULE;
  return {
    enabled: !!v.enabled,
    day: Number.isInteger(v.day) ? v.day : 1,
    time: typeof v.time === "string" ? v.time : "07:00",
    recipients: Array.isArray(v.recipients) ? v.recipients : [],
  };
}

export async function setReportSchedule(schedule: ReportSchedule, userId: string | null): Promise<void> {
  return setSetting(SETTING_REPORT_SCHEDULE, schedule, userId);
}
