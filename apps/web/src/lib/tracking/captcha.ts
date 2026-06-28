import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * CAPTCHA for the public tracking lookup (FR-PUB-012, Epic 11).
 *
 * Two interchangeable backends:
 *   - hCaptcha — used in production when NEXT_PUBLIC_HCAPTCHA_SITE_KEY +
 *     HCAPTCHA_SECRET are set. The client renders the hCaptcha widget; we verify
 *     the response token server-side.
 *   - A built-in signed arithmetic challenge — the fallback when hCaptcha isn't
 *     configured (e.g. the demo). The expected answer is HMAC-signed so the
 *     challenge is stateless and tamper-proof (no server session needed).
 *
 * Either way the gate only appears AFTER repeated failed lookups from an IP, so
 * a legitimate one-shot lookup is never challenged.
 */

export type ChallengeKind = "hcaptcha" | "math";

export interface MathChallenge {
  kind: "math";
  a: number;
  b: number;
  sig: string; // HMAC over "a:b" — proves a,b weren't tampered with
}
export interface HcaptchaChallenge {
  kind: "hcaptcha";
  siteKey: string;
}
export type Challenge = MathChallenge | HcaptchaChallenge;

export function isHcaptchaConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY && process.env.HCAPTCHA_SECRET);
}

/** Server-only HMAC key. The service-role key is always present and never reaches the client. */
function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "udtl-tracking-fallback-secret";
}
function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Issue the challenge appropriate to the configured backend (called when a gate is needed). */
export function issueChallenge(): Challenge {
  if (isHcaptchaConfigured()) {
    return { kind: "hcaptcha", siteKey: process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY! };
  }
  const a = randomInt(1, 10);
  const b = randomInt(1, 10);
  return { kind: "math", a, b, sig: sign(`${a}:${b}`) };
}

/** Verify the submitted CAPTCHA. Returns true on success. */
export async function verifyCaptcha(form: FormData, ip: string | null): Promise<boolean> {
  if (isHcaptchaConfigured()) {
    const token = String(form.get("h-captcha-response") ?? form.get("hcaptchaToken") ?? "");
    if (!token) return false;
    return verifyHcaptcha(token, ip);
  }
  // Math fallback: recompute the signature from the (untrusted) a,b and check the
  // answer. Both the tamper-check and the answer must hold.
  const a = Number(form.get("captchaA"));
  const b = Number(form.get("captchaB"));
  const sig = String(form.get("captchaSig") ?? "");
  const answer = Number(form.get("captchaAnswer"));
  if (!Number.isInteger(a) || !Number.isInteger(b) || !sig) return false;
  if (!safeEqual(sig, sign(`${a}:${b}`))) return false; // tampered challenge
  return Number.isInteger(answer) && answer === a + b;
}

async function verifyHcaptcha(token: string, ip: string | null): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: process.env.HCAPTCHA_SECRET!, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
