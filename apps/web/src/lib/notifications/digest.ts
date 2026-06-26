import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/sendgrid";
import { getDigestTimes } from "@/lib/settings";
import { LOAD_STATUS_LABELS } from "@/lib/loads";

const ACTIVE_STATUSES = ["new", "assigned", "in_transit"];
const WINDOW_MIN = 15; // matches the */15 cron cadence

const hhmm = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const etaFmt = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Winnipeg",
});

/** Is a configured "HH:MM" slot due in the current cron window? */
function slotDue(slot: string, nowMin: number): boolean {
  const [hs, ms] = slot.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const diff = nowMin - (h * 60 + m);
  return diff >= 0 && diff < WINDOW_MIN;
}

interface DigestLoad {
  id: number;
  ref: string;
  status: string;
  route: string;
  etaText: string | null;
}

/**
 * Twice-daily digest (Epic 9). Runs from the cron every 15m; only acts when the
 * current Winnipeg time falls in a configured digest window. Each active
 * customer user gets a summary of the active loads THEY can see (org loads, or
 * only-assigned for restricted users) — status + ETA. Email channel; CASL
 * opt-outs suppressed; deduped so a user gets at most one digest per window.
 */
export async function runDigests(): Promise<{ ran: boolean; slot: string | null; sent: number }> {
  const admin = createServiceClient();
  const times = await getDigestTimes();
  const now = hhmm.format(new Date()); // "08:07"
  const [nhs, nms] = now.split(":");
  const nowMin = Number(nhs) * 60 + Number(nms);
  const dueSlot = times.find((t) => slotDue(t, nowMin));
  if (!dueSlot) return { ran: false, slot: null, sent: 0 };

  const { data: users } = await admin
    .from("users")
    .select("id, email, name, organization_id, restricted")
    .in("role", ["customer_admin", "customer_user"])
    .eq("active", true);
  if (!users?.length) return { ran: true, slot: dueSlot, sent: 0 };

  const { data: optouts } = await admin
    .from("notification_optouts")
    .select("contact")
    .eq("channel", "email");
  const optedOut = new Set((optouts ?? []).map((o) => o.contact as string));

  // Dedup: skip anyone who already got a digest in the last 4h (digests are ~8h apart).
  const since = new Date(Date.now() - 4 * 3600 * 1000).toISOString();

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let sent = 0;

  for (const u of users) {
    const email = u.email as string | null;
    if (!email || optedOut.has(email)) continue;

    const { data: recent } = await admin
      .from("notification_log")
      .select("id")
      .eq("user_id", u.id)
      .eq("event", "digest")
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) continue;

    const loads = await activeLoadsFor(admin, u as { id: string; organization_id: string | null; restricted: boolean });
    if (!loads.length) continue;

    const rows = loads
      .map(
        (l) =>
          `<tr>
             <td style="padding:6px 10px;font-family:monospace;color:#1a1a1a">${l.ref}</td>
             <td style="padding:6px 10px;color:#475569">${l.route || "—"}</td>
             <td style="padding:6px 10px;color:#475569">${LOAD_STATUS_LABELS[l.status as keyof typeof LOAD_STATUS_LABELS] ?? l.status}</td>
             <td style="padding:6px 10px;color:#475569">${l.etaText ?? "—"}</td>
           </tr>`,
      )
      .join("");
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#334155;max-width:640px">
        <p>Here's your shipment update from <strong>United Dhillon Trucking Lines</strong> — ${loads.length} active order${loads.length === 1 ? "" : "s"}.</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e4e8ee">
          <thead><tr style="background:#f7f8fa;text-align:left">
            <th style="padding:6px 10px">Order</th><th style="padding:6px 10px">Route</th>
            <th style="padding:6px 10px">Status</th><th style="padding:6px 10px">ETA</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    const unsub = `${origin}/unsubscribe?t=${Buffer.from(`${email}:email`).toString("base64url")}`;
    const res = await sendEmail({ to: email, subject: "Your UDTL shipment digest", html, unsubscribeUrl: unsub });

    await admin.from("notification_log").insert({
      user_id: u.id,
      channel: "email",
      event: "digest",
      recipient: email,
      status: res.ok ? "sent" : "failed",
      subject: "Shipment digest",
      body: `${loads.length} active order(s)`,
      provider_message_id: res.id ?? null,
      error: res.error ?? null,
    });
    if (res.ok) sent++;
  }

  return { ran: true, slot: dueSlot, sent };
}

/** Active loads a customer user can see (org-wide, or only-assigned if restricted). */
async function activeLoadsFor(
  admin: ReturnType<typeof createServiceClient>,
  u: { id: string; organization_id: string | null; restricted: boolean },
): Promise<DigestLoad[]> {
  let loadIds: number[] | null = null;
  if (u.restricted) {
    const { data: assigned } = await admin
      .from("load_assigned_users")
      .select("load_id")
      .eq("user_id", u.id);
    loadIds = (assigned ?? []).map((a) => a.load_id as number);
    if (!loadIds.length) return [];
  }

  let q = admin
    .from("loads")
    .select("id, load_reference, order_number, status, live_eta_at, stops ( type, city, sequence )")
    .eq("organization_id", u.organization_id)
    .in("status", ACTIVE_STATUSES);
  if (loadIds) q = q.in("id", loadIds);
  const { data } = await q;

  return ((data ?? []) as Record<string, unknown>[]).map((l) => {
    const stops = (l.stops ?? []) as { type: string; city: string | null; sequence: number }[];
    const pickup = stops.find((s) => s.type === "pickup");
    const deliveries = stops.filter((s) => s.type === "delivery").sort((a, b) => a.sequence - b.sequence);
    return {
      id: l.id as number,
      ref: (l.order_number as string) || (l.load_reference as string),
      status: l.status as string,
      route: [pickup?.city, deliveries.at(-1)?.city].filter(Boolean).join(" → "),
      etaText: l.live_eta_at ? etaFmt.format(new Date(l.live_eta_at as string)) : null,
    };
  });
}
