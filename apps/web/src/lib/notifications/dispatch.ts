import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/sendgrid";
import { sendSms } from "@/lib/notifications/sms";
import type { NotifyChannel, NotifyEvent } from "@/lib/notifications/types";

export { eventForStatus } from "@/lib/notifications/types";

const etaFmt = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Winnipeg",
});

function copy(event: NotifyEvent, ref: string, route: string, etaText: string | null) {
  const r = route ? ` (${route})` : "";
  switch (event) {
    case "assigned":
      return { subject: `Order ${ref} scheduled`, line: `Your order ${ref}${r} has been scheduled and is being prepared.` };
    case "in_transit":
      return {
        subject: `Order ${ref} is in transit`,
        line: `Your order ${ref}${r} is now in transit.${etaText ? ` Estimated arrival ${etaText}.` : ""}`,
      };
    case "delivered":
      return { subject: `Order ${ref} delivered`, line: `Your order ${ref}${r} has been delivered.` };
    case "cancelled":
      return { subject: `Order ${ref} cancelled`, line: `Your order ${ref}${r} has been cancelled.` };
    case "delayed":
      return { subject: `Delay on order ${ref}`, line: `Heads up — your order ${ref}${r} is delayed. We'll keep you updated.` };
  }
}

interface LogRow {
  user_id: string;
  load_id: number;
  event: NotifyEvent;
  channel: NotifyChannel;
  recipient: string | null;
  status: "sent" | "failed" | "suppressed";
  subject?: string;
  body?: string;
  provider_message_id?: string | null;
  error?: string | null;
}

/**
 * Fan out a load event to every subscriber of (load, event), honoring the
 * channel they chose and CASL opt-outs. Each attempt is written to
 * notification_log. Best-effort — never throws (callers like the status-change
 * action must not fail if notifications do).
 */
export async function notifyLoadEvent(loadId: number, event: NotifyEvent): Promise<void> {
  try {
    const admin = createServiceClient();

    const { data: load } = await admin
      .from("loads")
      .select("id, load_reference, order_number, live_eta_at, stops ( type, city, sequence )")
      .eq("id", loadId)
      .single();
    if (!load) return;

    const stops = (load.stops ?? []) as { type: string; city: string | null; sequence: number }[];
    const pickup = stops.find((s) => s.type === "pickup");
    const deliveries = stops.filter((s) => s.type === "delivery").sort((a, b) => a.sequence - b.sequence);
    const ref = (load.order_number as string) || (load.load_reference as string);
    const route = [pickup?.city, deliveries.at(-1)?.city].filter(Boolean).join(" → ");
    const etaText = load.live_eta_at ? etaFmt.format(new Date(load.live_eta_at as string)) : null;
    const { subject, line } = copy(event, ref, route, etaText);

    // Subscribers for this load+event, with their contact details.
    const { data: subs } = await admin
      .from("notification_subscriptions")
      .select("user_id, channel, users ( email, phone )")
      .eq("load_id", loadId)
      .eq("event", event);
    if (!subs?.length) return;

    // Opt-out suppression list (CASL).
    const { data: optouts } = await admin.from("notification_optouts").select("contact, channel");
    const isOptedOut = (contact: string, channel: NotifyChannel) =>
      (optouts ?? []).some((o) => o.contact === contact && o.channel === channel);

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const rows: LogRow[] = [];

    for (const sub of subs) {
      const channel = sub.channel as NotifyChannel;
      const u = (sub.users ?? {}) as { email?: string | null; phone?: string | null };

      if (channel === "in_app") {
        rows.push({
          user_id: sub.user_id,
          load_id: loadId,
          event,
          channel,
          recipient: sub.user_id,
          status: "sent",
          subject,
          body: line,
        });
        continue;
      }

      const recipient = channel === "email" ? u.email : u.phone;
      if (!recipient) {
        rows.push({ user_id: sub.user_id, load_id: loadId, event, channel, recipient: null, status: "failed", subject, body: line, error: `No ${channel} contact on file` });
        continue;
      }
      if (isOptedOut(recipient, channel)) {
        rows.push({ user_id: sub.user_id, load_id: loadId, event, channel, recipient, status: "suppressed", subject, body: line });
        continue;
      }

      if (channel === "email") {
        const unsub = `${origin}/unsubscribe?t=${Buffer.from(`${recipient}:email`).toString("base64url")}`;
        const res = await sendEmail({
          to: recipient,
          subject,
          html: `<p style="font-family:Arial,sans-serif;font-size:15px;color:#334155">${line}</p>`,
          unsubscribeUrl: unsub,
        });
        rows.push({ user_id: sub.user_id, load_id: loadId, event, channel, recipient, status: res.ok ? "sent" : "failed", subject, body: line, provider_message_id: res.id ?? null, error: res.error ?? null });
      } else {
        const res = await sendSms(recipient, `UDTL: ${line} Reply STOP to opt out.`);
        rows.push({ user_id: sub.user_id, load_id: loadId, event, channel, recipient, status: res.ok ? "sent" : "failed", subject, body: line, provider_message_id: res.id ?? null, error: res.error ?? null });
      }
    }

    if (rows.length) await admin.from("notification_log").insert(rows);
  } catch (e) {
    console.error("[notifyLoadEvent] failed:", e);
  }
}
