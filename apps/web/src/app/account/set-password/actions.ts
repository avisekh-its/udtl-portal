"use server";

import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { validatePassword } from "@/lib/password";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { sendCreditApplicationEmail } from "@/lib/email/sendgrid";

export interface SetPasswordResult {
  error?: string;
  /** Account is set but still awaiting the credit application (mandatory-download gate). */
  awaitingCredit?: boolean;
}

/**
 * Set a password for the invited user (session established by the email link).
 *
 * Activation (Option B): the account becomes active only if it doesn't require
 * the credit form, OR a staff member has already marked the credit form
 * received. If it's still pending, the password is saved but the account stays
 * inactive until staff confirm receipt. The `active` flag is written with the
 * service client so a user can't self-activate past the credit gate.
 */
export async function setPasswordAction(formData: FormData): Promise<SetPasswordResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const check = validatePassword(password);
  if (!check.ok) return { error: check.errors[0] };
  if (password !== confirm) return { error: "Passwords do not match." };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your link has expired. Please request a new one." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("active, credit_form_required, credit_form_received, name, email")
    .eq("id", user.id)
    .single();
  // Fail CLOSED: if we can't read the profile, don't risk activating past the
  // credit gate — treat it as an invalid link rather than defaulting to active.
  if (!profile) return { error: "Your link has expired. Please request a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // Activate on the FIRST set when the credit gate is clear. Crucially, never
  // DOWNGRADE an already-active user — a routine password reset must not
  // deactivate a working customer whose credit was handled out-of-band.
  const activate =
    profile.active || !profile.credit_form_required || !!profile.credit_form_received;
  const admin = createServiceClient();
  await admin.from("users").update({ active: activate }).eq("id", user.id);

  await writeAudit({
    actorUserId: user.id,
    action: "auth.password_set",
    entityType: "user",
    entityId: user.id,
    after: { activated: activate },
    ip: await getRequestIp(),
  });

  // Awaiting credit: password is set but the account stays inactive. Send the
  // follow-up email (confirms password set + reiterates "Awaiting Credit", with
  // the credit application PDF attached), then hand back to the client to show
  // the MANDATORY download gate. We keep the session alive for that step;
  // finishCreditOnboardingAction signs out once they continue.
  if (!activate) {
    const sent = await sendCreditApplicationEmail(profile.email as string, profile.name as string | null);
    if (!sent.ok) {
      // Best-effort (never blocks onboarding), but a failure must not be
      // invisible — it means the customer got no copy of the credit form.
      console.error("[set-password] credit-application email failed:", sent.error, "→", profile.email);
    }
    await writeAudit({
      actorUserId: user.id,
      action: "auth.credit_email_" + (sent.ok ? "sent" : "failed"),
      entityType: "user",
      entityId: user.id,
      after: { to: profile.email, error: sent.ok ? null : (sent.error ?? "unknown") },
    });
    return { awaitingCredit: true };
  }
  redirect("/");
}

/**
 * Called after the awaiting-credit user has downloaded the credit application
 * (mandatory-download gate). Signs them out and lands them on login with the
 * "account will be activated once UDTL receives your credit application" notice.
 */
export async function finishCreditOnboardingAction(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login?error=credit_pending");
}
