"use server";

import { createServiceClient } from "@/lib/supabase/server";

export interface UnsubResult {
  ok?: boolean;
  contact?: string;
  channel?: string;
  error?: string;
}

/**
 * CASL email unsubscribe. The token is base64url("contact:channel") from the
 * email footer link. Adds an opt-out; the dispatcher then suppresses that
 * recipient on that channel.
 */
export async function unsubscribeAction(token: string): Promise<UnsubResult> {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { error: "That unsubscribe link is invalid." };
  }
  const idx = decoded.lastIndexOf(":");
  const contact = decoded.slice(0, idx);
  const channel = decoded.slice(idx + 1);
  if (!contact || (channel !== "email" && channel !== "sms")) {
    return { error: "That unsubscribe link is invalid." };
  }

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("notification_optouts")
    .select("id")
    .eq("contact", contact)
    .eq("channel", channel)
    .maybeSingle();
  if (!existing) {
    const { error } = await admin.from("notification_optouts").insert({ contact, channel });
    if (error) return { error: error.message };
  }
  return { ok: true, contact, channel };
}
