"use server";

import { submitRating } from "@/lib/ratings/service";

export interface SubmitRatingState {
  ok?: boolean;
  ref?: string;
  error?: string;
}

/** Public rating submission (Epic 13) — token-gated, no login. */
export async function submitRatingAction(token: string, score: number, review: string): Promise<SubmitRatingState> {
  const res = await submitRating(token, score, review);
  if (!res.ok) return { error: res.error };
  return { ok: true, ref: res.ref };
}
