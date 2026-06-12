"use server";

import { createServerClient } from "@/lib/supabase/server";

export interface ResetRequestResult {
  ok?: boolean;
  error?: string;
}

/**
 * Send a password-reset email. We always report success (never reveal whether
 * an email is registered). The link lands on /auth/callback, which establishes
 * a session and forwards to /account/set-password.
 */
export async function requestResetAction(formData: FormData): Promise<ResetRequestResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/account/set-password`,
  });

  return { ok: true };
}
