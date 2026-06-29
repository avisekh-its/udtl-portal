"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser, can } from "@/lib/auth";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/sendgrid";

/**
 * Post-delivery rating requests (Epic 13). Sent MANUALLY by staff — never
 * automatically — and only once a load is Delivered. Staff pick the recipient
 * at send time. Mirrors the tracking-link pattern: expiring + revocable token.
 */

export interface RatingActionResult {
  ok?: boolean;
  error?: string;
  url?: string;
  emailed?: boolean;
}

const EXPIRES_DAYS = 30;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const appOrigin = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function sendRatingRequestAction(loadId: number, recipientEmail: string): Promise<RatingActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "trigger_delayed_or_rating")) {
    return { error: "You don't have permission to send rating requests." };
  }
  const email = recipientEmail.trim();
  if (!email || !EMAIL_RE.test(email)) return { error: "Enter the recipient's email address." };

  const admin = createServiceClient();
  const { data: load } = await admin
    .from("loads")
    .select("id, status, order_number, load_reference")
    .eq("id", loadId)
    .maybeSingle();
  if (!load) return { error: "Load not found." };
  if (load.status !== "delivered") return { error: "Mark the load Delivered before requesting a rating." };

  const token = `rate_${(globalThis.crypto.randomUUID() as string).replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 86_400_000).toISOString();
  const { error } = await admin.from("ratings").insert({
    load_id: loadId,
    token,
    requested_by: actor.id,
    recipient_email: email,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };

  const url = `${appOrigin()}/rate/${token}`;
  const ref = (load.order_number as string) || (load.load_reference as string);
  const res = await sendEmail({ to: email, subject: `How did we do? Rate your UDTL shipment ${ref}`, html: ratingEmailHtml(url, ref) });

  await writeAudit({
    actorUserId: actor.id,
    action: "load.rating_requested",
    entityType: "load",
    entityId: String(loadId),
    after: { token, recipient: email, emailed: res.ok },
    ip: await getRequestIp(),
  });

  revalidatePath(`/ops/loads/${loadId}`);
  return { ok: true, url, emailed: res.ok };
}

export async function revokeRatingRequestAction(ratingId: number): Promise<RatingActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "trigger_delayed_or_rating")) {
    return { error: "You don't have permission to manage rating requests." };
  }
  const admin = createServiceClient();
  const { data: row } = await admin.from("ratings").select("id, load_id, revoked_at, submitted_at").eq("id", ratingId).maybeSingle();
  if (!row) return { error: "Rating request not found." };
  if (row.submitted_at) return { error: "This rating was already submitted." };
  if (row.revoked_at) return { ok: true };

  const { error } = await admin.from("ratings").update({ revoked_at: new Date().toISOString() }).eq("id", ratingId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: actor.id,
    action: "load.rating_request_revoked",
    entityType: "load",
    entityId: String(row.load_id),
    after: { ratingId },
    ip: await getRequestIp(),
  });

  revalidatePath(`/ops/loads/${row.load_id}`);
  return { ok: true };
}

function ratingEmailHtml(url: string, ref: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#334155;max-width:560px">
      <p>Hello,</p>
      <p>Your shipment <strong>${ref}</strong> with <strong>United Dhillon Trucking Lines</strong> has been delivered.
        We'd love your feedback — it takes less than a minute.</p>
      <p style="margin:22px 0">
        <a href="${url}" style="background:#e85d1c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">
          Rate this shipment
        </a>
      </p>
      <p style="color:#94a3b8;font-size:12px;border-top:1px solid #e4e8ee;padding-top:14px;margin-top:18px">
        United Dhillon Trucking Lines · Operated by ITS Inc.
      </p>
    </div>`;
}
