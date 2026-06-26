import "server-only";

/**
 * SMS via Twilio, with a mock fallback (same pattern as the FleetHunt provider).
 * If TWILIO_* creds are missing or SMS_MOCK=true, we log instead of sending so
 * the full code path works in the demo; drop in real creds later, no code change.
 */
interface SmsResult {
  ok: boolean;
  id?: string;
  error?: string;
  mocked?: boolean;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const mock = process.env.SMS_MOCK === "true" || !sid || !token || !from;

  if (mock) {
    console.log(`[sms:mock] → ${to}: ${body}`);
    return { ok: true, id: `mock-${to}-${body.length}`, mocked: true };
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from!, Body: body }),
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (res.ok) return { ok: true, id: json.sid };
    return { ok: false, error: `Twilio ${res.status}: ${json.message ?? "send failed"}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
