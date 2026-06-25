import "server-only";

/**
 * Direct SendGrid API sends (separate from Supabase's auth emails, which can't
 * carry attachments). Used for the credit-application follow-up. The key is the
 * same one configured for Supabase SMTP; set SENDGRID_API_KEY + SENDGRID_FROM_EMAIL.
 */
const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

interface SendResult {
  ok: boolean;
  error?: string;
}

/** Fetch the served credit-application PDF and return it base64-encoded. */
async function creditPdfBase64(): Promise<string | null> {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${origin}/credit-application.pdf`, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

/**
 * Follow-up after a credit-required customer sets their password: confirms the
 * password is set, reiterates "Awaiting Credit", and attaches the credit
 * application PDF so they have a permanent copy. Best-effort — never throws.
 */
export async function sendCreditApplicationEmail(to: string, name?: string | null): Promise<SendResult> {
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "SendGrid not configured" };

  const pdf = await creditPdfBase64();
  const greeting = name ? `Hi ${name},` : "Hello,";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#334155;max-width:560px">
      <p>${greeting}</p>
      <p>Your password for the <strong>United Dhillon Trucking Lines</strong> portal is set — thank you.</p>
      <p>Your account is currently <strong>Awaiting Credit</strong>. To activate it, please complete the
        attached <strong>credit application</strong> and return it to UDTL. Our team will activate your
        account as soon as it's received.</p>
      <p style="color:#64748b;font-size:13px">A copy of the credit application is attached to this email for your records.</p>
      <p style="color:#94a3b8;font-size:12px;border-top:1px solid #e4e8ee;padding-top:14px;margin-top:18px">
        United Dhillon Trucking Lines · Operated by ITS Inc.
      </p>
    </div>`;

  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: "United Dhillon Trucking Lines" },
    subject: "Action required: complete your UDTL credit application",
    content: [{ type: "text/html", value: html }],
    ...(pdf
      ? {
          attachments: [
            {
              content: pdf,
              filename: "UDTL-credit-application.pdf",
              type: "application/pdf",
              disposition: "attachment",
            },
          ],
        }
      : {}),
  };

  try {
    const res = await fetch(SENDGRID_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `SendGrid ${res.status}: ${(await res.text()).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
