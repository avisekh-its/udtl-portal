import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { RatingResolve, RatingRow, RatingsSummary } from "@/lib/ratings/types";

/**
 * Rating domain (Epic 13). All access is via the service role: staff actions
 * create/revoke requests, and the public /rate page resolves + submits through
 * here (the token is the gate; there is no authenticated user).
 */

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Resolve a rating token to its load + current state (for the public page). */
export async function resolveRatingToken(raw: string): Promise<RatingResolve> {
  const token = raw.trim();
  if (!token) return { ok: false, reason: "not_found" };
  const admin = createServiceClient();
  const { data } = await admin
    .from("ratings")
    .select("load_id, expires_at, revoked_at, submitted_at, score, review, load:load_id ( order_number, load_reference )")
    .eq("token", token)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  if (data.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(data.expires_at as string).getTime() < Date.now() && !data.submitted_at) {
    return { ok: false, reason: "expired" };
  }
  const load = one(data.load as { order_number: string | null; load_reference: string } | { order_number: string | null; load_reference: string }[] | null);
  return {
    ok: true,
    loadId: data.load_id as number,
    ref: (load?.order_number as string) || (load?.load_reference as string) || `Load #${data.load_id}`,
    alreadySubmitted: !!data.submitted_at,
    score: (data.score as number | null) ?? null,
    review: (data.review as string | null) ?? null,
  };
}

export type SubmitResult = { ok: true; ref: string } | { ok: false; error: string };

/** Record a customer's score + review against the load (public, token-gated). */
export async function submitRating(rawToken: string, score: number, review: string): Promise<SubmitResult> {
  const resolved = await resolveRatingToken(rawToken);
  if (!resolved.ok) {
    const msg = resolved.reason === "expired" ? "This rating link has expired." : resolved.reason === "revoked" ? "This rating link is no longer active." : "We couldn't find that rating link.";
    return { ok: false, error: msg };
  }
  if (resolved.alreadySubmitted) return { ok: false, error: "A rating has already been submitted for this shipment. Thank you!" };
  if (!Number.isInteger(score) || score < 1 || score > 5) return { ok: false, error: "Choose a score from 1 to 5 stars." };

  const admin = createServiceClient();
  const { data: row } = await admin.from("ratings").select("id, recipient_email").eq("token", rawToken.trim()).maybeSingle();
  if (!row) return { ok: false, error: "We couldn't find that rating link." };

  const { error } = await admin
    .from("ratings")
    .update({
      score,
      review: review.trim() || null,
      respondent_email: (row.recipient_email as string | null) ?? null,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .is("submitted_at", null); // guard against a double submit race
  if (error) return { ok: false, error: error.message };

  await writeAudit({
    actorUserId: null,
    action: "load.rating_submitted",
    entityType: "load",
    entityId: String(resolved.loadId),
    after: { score, hasReview: !!review.trim() },
  });

  return { ok: true, ref: resolved.ref };
}

/** All rating rows for a load (for the staff panel). */
export async function ratingsForLoad(loadId: number): Promise<RatingRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("ratings")
    .select("id, token, recipient_email, expires_at, revoked_at, score, review, respondent_email, submitted_at")
    .eq("load_id", loadId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as number,
    token: r.token as string,
    recipientEmail: (r.recipient_email as string | null) ?? null,
    expiresAt: r.expires_at as string,
    revokedAt: (r.revoked_at as string | null) ?? null,
    score: (r.score as number | null) ?? null,
    review: (r.review as string | null) ?? null,
    respondentEmail: (r.respondent_email as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
  }));
}

interface SummaryFilters {
  customerId: string | null;
  from: string;
  to: string;
}

/** Submitted ratings for the reports dashboard, scoped by customer + date range. */
export async function ratingsSummary(filters: SummaryFilters): Promise<RatingsSummary> {
  const admin = createServiceClient();
  let q = admin
    .from("ratings")
    .select(
      "score, review, submitted_at, load:load_id!inner ( id, order_number, load_reference, organization_id, organization:organization_id ( name ) )",
    )
    .not("submitted_at", "is", null)
    .not("score", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(500);
  if (filters.customerId) q = q.eq("load.organization_id", filters.customerId);
  const { data } = await q;

  const fromMs = Date.parse(`${filters.from}T00:00:00Z`);
  const toMs = Date.parse(`${filters.to}T23:59:59Z`);
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => {
    const t = Date.parse(r.submitted_at as string);
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  });

  const count = rows.length;
  const average = count ? Math.round((rows.reduce((a, r) => a + (r.score as number), 0) / count) * 10) / 10 : null;
  const recent = rows.slice(0, 8).map((r) => {
    const load = one(r.load as Record<string, unknown> | Record<string, unknown>[] | null) ?? {};
    const org = one((load as { organization?: unknown }).organization as { name: string } | { name: string }[] | null);
    return {
      loadId: (load as { id: number }).id,
      ref: ((load as { order_number?: string }).order_number as string) || ((load as { load_reference: string }).load_reference as string),
      customer: org?.name ?? "—",
      score: r.score as number,
      review: (r.review as string | null) ?? null,
      at: (r.submitted_at as string | null) ?? null,
    };
  });

  return { count, average, recent };
}
