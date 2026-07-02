"use server";

import { redirect } from "next/navigation";
import { getRequestIp } from "@/lib/audit";
import { resolveTrackingToken } from "@/lib/tracking/public";
import { issueChallenge, verifyCaptcha, type Challenge } from "@/lib/tracking/captcha";
import { countLookups, logLookup, HARD_CAP, CAPTCHA_AFTER } from "@/lib/tracking/lookup-limit";

/**
 * Public tracking-number lookup (Epic 11). Resolves a tracking number to its
 * public view, with per-IP rate limiting and a CAPTCHA gate that engages only
 * after repeated failed attempts — so tracking numbers can't be enumerated.
 * The counters are shared with direct /track/<token> visits (lookup-limit).
 */

export interface LookupState {
  error?: string;
  requireCaptcha?: boolean;
  challenge?: Challenge;
}

export async function lookupTrackingAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const raw = String(formData.get("trackingNumber") ?? "").trim();
  const ip = await getRequestIp();

  // Hard rate limit — independent of success/failure.
  if ((await countLookups(ip)) >= HARD_CAP) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // CAPTCHA gate after repeated failures.
  const failed = await countLookups(ip, { onlyFailed: true });
  if (failed >= CAPTCHA_AFTER) {
    const ok = await verifyCaptcha(formData, ip);
    if (!ok) {
      return { error: "Please complete the verification below.", requireCaptcha: true, challenge: issueChallenge() };
    }
  }

  if (!raw) {
    return needCaptcha(failed) ? { error: "Enter a tracking number.", requireCaptcha: true, challenge: issueChallenge() } : { error: "Enter a tracking number." };
  }

  const resolved = await resolveTrackingToken(raw);
  const ok = resolved.ok;
  await logLookup(ip, ok);

  if (ok) redirect(`/track/${encodeURIComponent(raw)}`);

  const failedNow = failed + 1;
  return needCaptcha(failedNow)
    ? { error: "We couldn't find that tracking number. Check it and try again.", requireCaptcha: true, challenge: issueChallenge() }
    : { error: "We couldn't find that tracking number. Check it and try again." };
}

function needCaptcha(failed: number): boolean {
  return failed >= CAPTCHA_AFTER;
}
