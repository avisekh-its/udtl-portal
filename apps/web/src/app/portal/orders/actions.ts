"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { NotifyChannel, NotifyEvent } from "@/lib/notifications/types";

export interface SubResult {
  ok?: boolean;
  error?: string;
}

export interface SubSelection {
  event: NotifyEvent;
  channel: NotifyChannel;
}

/** Normalize a North-American number to E.164 (+1XXXXXXXXXX), or null if invalid. */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Replace the caller's notification subscriptions for one order with the given
 * set. CASL: any email/SMS selection requires explicit consent, stamped on each
 * row (consent_at). Uses the user's RLS client, so a user can only subscribe to
 * orders they're allowed to see (nsub_insert checks can_view_load + own id).
 * If SMS is selected and the profile has no phone, a `phone` provided here is
 * saved to the profile (E.164) so the panel never dead-ends.
 */
export async function saveSubscriptionsAction(
  loadId: number,
  selected: SubSelection[],
  consent: boolean,
  phone?: string,
): Promise<SubResult> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Not signed in." };

  const needsConsent = selected.some((s) => s.channel === "email" || s.channel === "sms");
  if (needsConsent && !consent) {
    return { error: "Please confirm consent to receive email or SMS updates." };
  }

  const supabase = await createServerClient();

  if (selected.some((s) => s.channel === "sms")) {
    const { data: me } = await supabase.from("users").select("phone").eq("id", actor.id).single();
    if (!me?.phone) {
      const normalized = phone?.trim() ? toE164(phone) : null;
      if (!normalized) {
        return {
          error: phone?.trim()
            ? "That phone number doesn't look valid — use a 10-digit number like 204-555-0142."
            : "Add a mobile number below to receive SMS, or untick the SMS boxes.",
        };
      }
      // Self-update of `phone` is permitted (privileged columns are trigger-blocked).
      const { error: phErr } = await supabase.from("users").update({ phone: normalized }).eq("id", actor.id);
      if (phErr) return { error: `Couldn't save your phone number: ${phErr.message}` };
    }
  }

  // Sync: clear this user's subs for the order, then insert the chosen set.
  const { error: delErr } = await supabase
    .from("notification_subscriptions")
    .delete()
    .eq("load_id", loadId)
    .eq("user_id", actor.id);
  if (delErr) return { error: delErr.message };

  if (selected.length) {
    const now = new Date().toISOString();
    const rows = selected.map((s) => ({
      user_id: actor.id,
      load_id: loadId,
      event: s.event,
      channel: s.channel,
      consent_at: now,
    }));
    const { error } = await supabase.from("notification_subscriptions").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath(`/portal/orders/${loadId}`);
  return { ok: true };
}
