/**
 * Weekly performance-report email — Vercel Cron entry point (Epic 12).
 *
 * Runs every 15 min (vercel.json). runScheduledReports() only acts when the
 * current Winnipeg day+time matches the configured schedule (Settings → weekly
 * report), then emails recipients the last-7-days summary with CSV + PDF
 * attached. Security: requires `Authorization: Bearer $CRON_SECRET` in production.
 */
import { runScheduledReports } from "@/lib/reports/scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.APP_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runScheduledReports();
    return Response.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
