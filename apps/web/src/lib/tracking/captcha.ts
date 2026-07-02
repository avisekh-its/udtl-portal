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

export type ChallengeKind = "hcaptcha" | "code";

export interface CodeChallenge {
  kind: "code";
  /** Distorted-code image as an SVG data URI ("type the characters you see"). */
  imageUri: string;
  sig: string; // HMAC over the expected code — verified against the typed answer
}
export interface HcaptchaChallenge {
  kind: "hcaptcha";
  siteKey: string;
}
export type Challenge = CodeChallenge | HcaptchaChallenge;

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

// No ambiguous glyphs (0/O, 1/I/L) — customers type this from a distorted image.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 5;

/** Render the code as a distorted SVG "type what you see" image (data URI). */
function codeImage(code: string): string {
  const w = 200;
  const h = 64;
  const colors = ["#1f2937", "#334155", "#c2410c", "#475569"];
  const glyphs = [...code]
    .map((ch, i) => {
      const x = 24 + i * 34 + randomInt(-4, 5);
      const y = 40 + randomInt(-6, 7);
      const rot = randomInt(-18, 19);
      const color = colors[randomInt(0, colors.length)];
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Georgia, 'Times New Roman', serif" font-size="${30 + randomInt(-3, 4)}" font-weight="700" fill="${color}">${ch}</text>`;
    })
    .join("");
  const noise = Array.from({ length: 4 }, () => {
    const y1 = randomInt(8, h - 8);
    const y2 = randomInt(8, h - 8);
    const mid = randomInt(10, w - 10);
    return `<path d="M0 ${y1} Q ${mid} ${randomInt(0, h)}, ${w} ${y2}" stroke="#94a3b8" stroke-width="1.2" fill="none" opacity="0.55"/>`;
  }).join("");
  const dots = Array.from({ length: 24 }, () =>
    `<circle cx="${randomInt(0, w)}" cy="${randomInt(0, h)}" r="${randomInt(1, 3)}" fill="#cbd5e1" opacity="0.7"/>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f8fafc"/>${dots}${noise}${glyphs}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Issue the challenge appropriate to the configured backend (called when a gate is needed). */
export function issueChallenge(): Challenge {
  if (isHcaptchaConfigured()) {
    return { kind: "hcaptcha", siteKey: process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY! };
  }
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) code += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  return { kind: "code", imageUri: codeImage(code), sig: sign(code) };
}

/** Verify the submitted CAPTCHA. Returns true on success. */
export async function verifyCaptcha(form: FormData, ip: string | null): Promise<boolean> {
  if (isHcaptchaConfigured()) {
    const token = String(form.get("h-captcha-response") ?? form.get("hcaptchaToken") ?? "");
    if (!token) return false;
    return verifyHcaptcha(token, ip);
  }
  // Code fallback: the typed answer must HMAC to the challenge signature —
  // stateless, and the sig itself reveals nothing about the code.
  const sig = String(form.get("captchaSig") ?? "");
  const answer = String(form.get("captchaAnswer") ?? "").trim().toUpperCase();
  if (!sig || answer.length !== CODE_LEN) return false;
  return safeEqual(sig, sign(answer));
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
