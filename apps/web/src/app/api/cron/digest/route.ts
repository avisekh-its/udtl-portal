/**
 * Twice-daily customer digest — Vercel Cron entry point (Epic 9).
 *
 * Runs every 15 min (vercel.json). runDigests() only acts when the current
 * Winnipeg time lands in a configured digest window (Settings → digest times),
 * then emails each customer a summary of their active loads' status + ETA.
 * Security: requires `Authorization: Bearer $CRON_SECRET` in production.
 */
import { runDigests } from "@/lib/notifications/digest";

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
    const result = await runDigests();
    return Response.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
