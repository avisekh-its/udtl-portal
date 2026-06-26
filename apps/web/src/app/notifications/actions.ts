"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/** Mark all of the caller's unread in-app notifications as read (clears the badge). */
export async function markNotificationsReadAction(): Promise<void> {
  const actor = await getCurrentUser();
  if (!actor) return;
  const admin = createServiceClient();
  await admin
    .from("notification_log")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", actor.id)
    .eq("channel", "in_app")
    .is("read_at", null);
}
