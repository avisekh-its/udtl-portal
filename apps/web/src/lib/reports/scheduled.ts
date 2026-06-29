import "server-only";
import { sendEmail } from "@/lib/email/sendgrid";
import { getReportSchedule, setSetting, getSetting, SETTING_REPORT_LAST_SENT } from "@/lib/settings";
import { computeReport } from "@/lib/reports/compute";
import { buildReportCsv } from "@/lib/reports/csv";
import { buildReportPdf } from "@/lib/reports/pdf";
import { ymd } from "@/lib/reports/filters";
import { formatDelay } from "@/lib/reports/on-time";
import type { ReportFilters } from "@/lib/reports/types";

const WINDOW_MIN = 15; // matches the */15 cron cadence
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Current Winnipeg weekday index, minutes-into-day, and a date key for dedup. */
function winnipegNow(d: Date): { dayIdx: number; nowMin: number; dateKey: string } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Winnipeg",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  return {
    dayIdx: DAYS.indexOf(p.weekday!),
    nowMin: hour * 60 + Number(p.minute),
    dateKey: `${p.year}-${p.month}-${p.day}`,
  };
}

/**
 * Weekly performance-report email (Epic 12). Runs from the cron every 15m; only
 * acts when the current Winnipeg day+time matches the configured schedule, and
 * is deduped so it sends at most once per day. Emails each recipient the
 * last-7-days performance summary with CSV + PDF attached.
 */
export async function runScheduledReports(): Promise<{ ran: boolean; reason?: string; sent?: number }> {
  const schedule = await getReportSchedule();
  if (!schedule.enabled) return { ran: false, reason: "disabled" };
  const recipients = schedule.recipients.map((r) => r.trim()).filter(Boolean);
  if (!recipients.length) return { ran: false, reason: "no recipients" };

  const { dayIdx, nowMin, dateKey } = winnipegNow(new Date());
  if (dayIdx !== schedule.day) return { ran: false, reason: "not scheduled day" };

  const [hs, ms] = schedule.time.split(":");
  const slotMin = Number(hs) * 60 + Number(ms);
  const diff = nowMin - slotMin;
  if (!(diff >= 0 && diff < WINDOW_MIN)) return { ran: false, reason: "not in window" };

  const lastSent = await getSetting<string>(SETTING_REPORT_LAST_SENT, "");
  if (lastSent === dateKey) return { ran: false, reason: "already sent today" };

  // Last 7 days, all customers.
  const now = new Date();
  const filters: ReportFilters = {
    customerId: null,
    from: ymd(new Date(now.getTime() - 6 * 86_400_000)),
    to: ymd(now),
    status: "all",
    stopType: "all",
  };
  const result = await computeReport(filters);
  const csv = buildReportCsv(result, "All customers");
  const pdf = await buildReportPdf(result, "All customers");
  const base = `udtl-performance-${filters.from}_${filters.to}`;
  const k = result.kpis;
  const pct = (v: number | null) => (v == null ? "n/a" : `${v}%`);

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#334155;max-width:560px">
      <p>Weekly performance summary from <strong>United Dhillon Trucking Lines</strong> (${filters.from} → ${filters.to}).</p>
      <ul style="font-size:14px;color:#475569">
        <li>On-time delivery: <strong>${pct(k.onTimeDeliveryPct)}</strong></li>
        <li>On-time pickup: <strong>${pct(k.onTimePickupPct)}</strong></li>
        <li>Loads in range: <strong>${k.totalLoads}</strong> · Late loads: <strong>${k.lateLoads}</strong></li>
        <li>Avg delay (late loads): <strong>${formatDelay(k.avgDelayLateLoadsMin)}</strong></li>
      </ul>
      <p style="font-size:13px;color:#64748b">Full breakdown attached (CSV + PDF).</p>
    </div>`;

  const attachments = [
    { content: Buffer.from(csv).toString("base64"), filename: `${base}.csv`, type: "text/csv" },
    { content: Buffer.from(pdf).toString("base64"), filename: `${base}.pdf`, type: "application/pdf" },
  ];

  let sent = 0;
  for (const to of recipients) {
    const res = await sendEmail({ to, subject: `UDTL weekly performance report (${filters.from} → ${filters.to})`, html, attachments });
    if (res.ok) sent++;
  }

  await setSetting(SETTING_REPORT_LAST_SENT, dateKey, null);
  return { ran: true, sent };
}
