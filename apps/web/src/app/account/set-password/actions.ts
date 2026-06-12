"use server";

import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { validatePassword } from "@/lib/password";
import { getRequestIp, writeAudit } from "@/lib/audit";

export interface SetPasswordResult {
  error?: string;
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
    .select("credit_form_required, credit_form_received")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  const activate = !profile?.credit_form_required || !!profile?.credit_form_received;
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

  // If still awaiting the credit form, they can't use the app yet.
  if (!activate) redirect("/login?error=credit_pending");
  redirect("/");
}
