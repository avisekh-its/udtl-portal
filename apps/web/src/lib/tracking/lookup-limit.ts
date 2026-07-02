import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Shared per-IP throttle for BOTH public tracking entry points (Epic 11):
 * the /track lookup form AND direct /track/<token> URL visits. Every attempt
 * is logged; the form adds a CAPTCHA after repeated failures, and both paths
 * share the hard cap so URL-guessing can't bypass the form's gate.
 */

export const WINDOW_MIN = 15; // sliding window for all counters
export const HARD_CAP = 30; // attempts/window/IP before a hard "slow down"
export const CAPTCHA_AFTER = 4; // failed attempts/window/IP before a CAPTCHA is required

export async function countLookups(ip: string | null, opts: { onlyFailed?: boolean } = {}): Promise<number> {
  const admin = createServiceClient();
  const cutoff = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  let q = admin
    .from("tracking_lookups")
    .select("id", { count: "exact", head: true })
    .gte("created_at", cutoff);
  q = ip ? q.eq("ip", ip) : q.is("ip", null);
  if (opts.onlyFailed) q = q.eq("ok", false);
  const { count } = await q;
  return count ?? 0;
}

/** Record one attempt (best-effort — never blocks the response). */
export async function logLookup(ip: string | null, ok: boolean): Promise<void> {
  try {
    const admin = createServiceClient();
    await admin.from("tracking_lookups").insert({ ip, ok });
  } catch {
    /* logging must never break the public page */
  }
}
