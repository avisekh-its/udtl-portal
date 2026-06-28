"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser, can } from "@/lib/auth";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/sendgrid";

/**
 * Staff-generated one-time tracking links (Epic 11): expiring, revocable, single
 * order. Separate from the order's permanent public token so revoking a shared
 * link never disturbs the standing tracking number.
 */

export interface LinkActionResult {
  ok?: boolean;
  error?: string;
  url?: string;
  emailed?: boolean;
}

const ALLOWED_DAYS = [1, 7, 30];
const appOrigin = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function generateTrackingLinkAction(
  loadId: number,
  recipientEmail: string,
  expiresInDays: number,
): Promise<LinkActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "create_edit_loads")) {
    return { error: "You don't have permission to share tracking links." };
  }
  const days = ALLOWED_DAYS.includes(expiresInDays) ? expiresInDays : 7;
  const email = recipientEmail.trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address (or leave it blank to just copy the link)." };
  }

  const admin = createServiceClient();
  // Make sure the load exists before minting a link for it.
  const { data: load } = await admin.from("loads").select("id, order_number, load_reference").eq("id", loadId).maybeSingle();
  if (!load) return { error: "Load not found." };

  const token = `lnk_${(globalThis.crypto.randomUUID() as string).replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

  const { error } = await admin.from("tracking_links").insert({
    load_id: loadId,
    token,
    created_by: actor.id,
    recipient_email: email || null,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };

  const url = `${appOrigin()}/track/${token}`;
  const ref = (load.order_number as string) || (load.load_reference as string);

  let emailed = false;
  if (email) {
    const res = await sendEmail({
      to: email,
      subject: `Track your UDTL shipment ${ref}`,
      html: trackingEmailHtml(url, ref, days),
    });
    emailed = res.ok;
  }

  await writeAudit({
    actorUserId: actor.id,
    action: "load.tracking_link_created",
    entityType: "load",
    entityId: String(loadId),
    after: { token, expiresAt, recipient: email || null, emailed },
    ip: await getRequestIp(),
  });

  revalidatePath(`/ops/loads/${loadId}`);
  return { ok: true, url, emailed };
}

export async function revokeTrackingLinkAction(linkId: number): Promise<LinkActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "create_edit_loads")) {
    return { error: "You don't have permission to revoke tracking links." };
  }
  const admin = createServiceClient();
  const { data: link } = await admin
    .from("tracking_links")
    .select("id, load_id, revoked_at")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { error: "Link not found." };
  if (link.revoked_at) return { ok: true }; // already revoked — no-op

  const { error } = await admin
    .from("tracking_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: actor.id,
    action: "load.tracking_link_revoked",
    entityType: "load",
    entityId: String(link.load_id),
    after: { linkId },
    ip: await getRequestIp(),
  });

  revalidatePath(`/ops/loads/${link.load_id}`);
  return { ok: true };
}

function trackingEmailHtml(url: string, ref: string, days: number): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#334155;max-width:560px">
      <p>Hello,</p>
      <p>You can track your <strong>United Dhillon Trucking Lines</strong> shipment
        <strong>${ref}</strong> using the secure link below — no login required.</p>
      <p style="margin:22px 0">
        <a href="${url}" style="background:#e85d1c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">
          Track shipment
        </a>
      </p>
      <p style="color:#64748b;font-size:13px">This link expires in ${days} day${days === 1 ? "" : "s"} and can be turned off by UDTL at any time.</p>
      <p style="color:#94a3b8;font-size:12px;border-top:1px solid #e4e8ee;padding-top:14px;margin-top:18px">
        United Dhillon Trucking Lines · Operated by ITS Inc.
      </p>
    </div>`;
}
