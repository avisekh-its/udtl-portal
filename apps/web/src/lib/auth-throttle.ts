/**
 * Account lockout / login throttle (FR-AUTH-001).
 *
 * Serverless request handlers are stateless, so failed-attempt counting lives
 * in the `login_attempts` table. After LOGIN_MAX_ATTEMPTS failures for an email
 * inside the rolling LOGIN_LOCKOUT_MINUTES window, the account is locked until
 * the window passes; a successful login clears the failures.
 *
 * We key the lock on EMAIL (the thing an attacker is guessing). This is a known
 * trade-off: an attacker who knows a victim's email could deliberately trip the
 * lock (a soft DoS). Acceptable for this audience (≤150 known users) because the
 * window auto-expires and messages stay generic. Per-IP allow-listing or a
 * CAPTCHA step can be added later if abuse appears.
 *
 * Accessed only through the service-role client — `login_attempts` is fully
 * locked down to `authenticated` by RLS (default-deny, no policies).
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
const LOCKOUT_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15);

export interface LockoutStatus {
  locked: boolean;
  minutesRemaining: number;
}

/** Is this email currently locked out? Returns minutes left if so. */
export async function getLockoutStatus(email: string): Promise<LockoutStatus> {
  const admin = createServiceClient();
  const sinceIso = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString();

  const { data, error } = await admin
    .from("login_attempts")
    .select("attempted_at")
    .eq("email", email)
    .eq("succeeded", false)
    .gte("attempted_at", sinceIso)
    .order("attempted_at", { ascending: true });

  if (error || !data || data.length < MAX_ATTEMPTS) {
    return { locked: false, minutesRemaining: 0 };
  }

  // Lock runs from the oldest failure still inside the window.
  const oldest = new Date(data[0]!.attempted_at as string).getTime();
  const unlockAt = oldest + LOCKOUT_MINUTES * 60_000;
  const minutesRemaining = Math.max(0, Math.ceil((unlockAt - Date.now()) / 60_000));
  return { locked: minutesRemaining > 0, minutesRemaining };
}

/** Record one login attempt (success or failure). */
export async function recordLoginAttempt(
  email: string,
  ip: string | null,
  succeeded: boolean,
): Promise<void> {
  const admin = createServiceClient();
  await admin.from("login_attempts").insert({ email, ip, succeeded });
}

/** Clear an email's failed attempts after a successful login. */
export async function clearLoginAttempts(email: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("login_attempts").delete().eq("email", email).eq("succeeded", false);
}
