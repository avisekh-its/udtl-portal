/** Client-safe rating types (Epic 13). */

export interface RatingRow {
  id: number;
  token: string;
  recipientEmail: string | null;
  expiresAt: string;
  revokedAt: string | null;
  score: number | null;
  review: string | null;
  respondentEmail: string | null;
  submittedAt: string | null;
}

export type RatingResolve =
  | {
      ok: true;
      loadId: number;
      ref: string;
      alreadySubmitted: boolean;
      score: number | null;
      review: string | null;
    }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };

export interface RatingsSummary {
  count: number;
  average: number | null; // 1 decimal
  recent: {
    loadId: number;
    ref: string;
    customer: string;
    score: number;
    review: string | null;
    at: string | null;
  }[];
}
