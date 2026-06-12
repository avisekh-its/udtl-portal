"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { dashboardPathForRole, type UserRole } from "@/lib/auth";
import {
  getLockoutStatus,
  recordLoginAttempt,
  clearLoginAttempts,
} from "@/lib/auth-throttle";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { LAST_ACTIVITY_COOKIE, activityCookieOptions } from "@/lib/session";

export interface LoginResult {
  error?: string;
}

/**
 * Sign in with email + password via Supabase Auth, then route the user to the
 * dashboard for their role. Returns { error } on failure; on success it throws
 * a redirect (handled by Next), so callers won't get a value back.
 *
 * Hardening (FR-AUTH-001): account lockout after repeated failures, last-login
 * stamp, and an audit entry on success.
 */
export async function signInAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const ip = await getRequestIp();

  // Lockout gate — before we even hit Supabase.
  const lock = await getLockoutStatus(email);
  if (lock.locked) {
    return {
      error: `Too many failed attempts. Try again in ${lock.minutesRemaining} minute${
        lock.minutesRemaining === 1 ? "" : "s"
      }.`,
    };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await recordLoginAttempt(email, ip, false);
    // Keep the message generic — don't reveal which field was wrong.
    return { error: "Incorrect email or password." };
  }

  // The client now holds the session in memory — read the role for routing.
  const { data: profile } = await supabase
    .from("users")
    .select("role, active")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "Your account isn't set up yet. Please contact your administrator." };
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    return { error: "Your account is disabled. Please contact your administrator." };
  }

  // Success: clear throttle, start a fresh idle clock (so a stale activity
  // cookie from a previous session can't immediately time us out), stamp last
  // login, audit.
  await clearLoginAttempts(email);
  (await cookies()).set(LAST_ACTIVITY_COOKIE, String(Date.now()), activityCookieOptions());
  const admin = createServiceClient();
  await admin
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", data.user.id);
  await writeAudit({
    actorUserId: data.user.id,
    action: "auth.login",
    entityType: "user",
    entityId: data.user.id,
    ip,
  });

  redirect(dashboardPathForRole(profile.role as UserRole));
}
