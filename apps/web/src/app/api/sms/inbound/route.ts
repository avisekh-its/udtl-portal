/**
 * Twilio inbound-SMS webhook (CASL). When a recipient replies STOP we record an
 * SMS opt-out for their number so the dispatcher suppresses them; START re-opts
 * them in. Twilio also enforces STOP at the carrier level — this keeps OUR
 * suppression list in sync. (Production hardening: validate the X-Twilio-Signature.)
 */
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_WORDS = ["START", "YES", "UNSTOP"];

function twiml() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const from = String(form.get("From") ?? "").trim();
    const body = String(form.get("Body") ?? "").trim().toUpperCase();
    if (from) {
      const admin = createServiceClient();
      if (STOP_WORDS.includes(body)) {
        const { data: ex } = await admin
          .from("notification_optouts")
          .select("id")
          .eq("contact", from)
          .eq("channel", "sms")
          .maybeSingle();
        if (!ex) await admin.from("notification_optouts").insert({ contact: from, channel: "sms" });
      } else if (START_WORDS.includes(body)) {
        await admin.from("notification_optouts").delete().eq("contact", from).eq("channel", "sms");
      }
    }
  } catch {
    /* never fail the webhook */
  }
  return twiml();
}
