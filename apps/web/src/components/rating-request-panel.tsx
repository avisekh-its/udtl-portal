"use client";

import { useState, useTransition } from "react";
import { sendRatingRequestAction, revokeRatingRequestAction } from "@/app/ops/loads/rating-actions";
import { StarRating } from "@/components/star-rating";
import type { RatingRow } from "@/lib/ratings/types";

const fmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Winnipeg" });
const when = (iso: string) => fmt.format(new Date(iso));
const isExpired = (iso: string) => new Date(iso).getTime() < Date.now();

/**
 * Post-delivery rating (Epic 13). Rendered on a Delivered load. Sending is
 * MANUAL — staff opt in and choose the recipient. Submitted ratings are surfaced
 * here for UDTL.
 */
export function RatingRequestPanel({ loadId, ratings }: { loadId: number; ratings: RatingRow[] }) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok?: boolean; url?: string; emailed?: boolean; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function send() {
    setResult(null);
    startTransition(async () => {
      const r = await sendRatingRequestAction(loadId, email);
      setResult(r);
      if (r.ok) setEmail("");
    });
  }
  function revoke(id: number) {
    startTransition(async () => {
      await revokeRatingRequestAction(id);
    });
  }
  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const submitted = ratings.filter((r) => r.submittedAt && r.score);
  const pendingReqs = ratings.filter((r) => !r.submittedAt && !r.revokedAt && !isExpired(r.expiresAt));

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">Rating &amp; review</h2>
      <p className="mt-1 text-xs text-slate-500">
        Optionally ask this customer to rate the delivery. Requests are only sent when you choose to — nothing goes out automatically.
      </p>

      {/* Submitted ratings */}
      {submitted.length > 0 && (
        <div className="mt-4 space-y-3">
          {submitted.map((r) => (
            <div key={r.id} className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StarRating value={r.score!} />
                <span className="text-sm font-semibold text-slate-800">{r.score}/5</span>
                <span className="text-xs text-slate-400">· {r.respondentEmail || r.recipientEmail || "customer"} · {r.submittedAt ? when(r.submittedAt) : ""}</span>
              </div>
              {r.review && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">“{r.review}”</p>}
            </div>
          ))}
        </div>
      )}

      {/* Send form */}
      <div className="mt-4 border-t border-[var(--color-border)] pt-4">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Send a rating request</label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="min-w-[220px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-secondary)]"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending}
            className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send request"}
          </button>
        </div>
        {result?.error && <p className="mt-2 text-sm text-[var(--color-error)]">{result.error}</p>}
        {result?.ok && (
          <div className="mt-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-3 py-2 text-sm text-slate-700">
            {result.emailed ? "Request emailed. " : "Request created (email not sent — share the link). "}
            <span className="break-all font-mono text-xs">{result.url}</span>{" "}
            <button type="button" onClick={() => copy(result.url!)} className="font-medium text-[var(--color-secondary)] hover:underline">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>

      {/* Pending requests */}
      {pendingReqs.length > 0 && (
        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Awaiting response ({pendingReqs.length})</label>
          <ul className="mt-2 space-y-2">
            {pendingReqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="text-slate-700">{r.recipientEmail || "Link"}</span>
                  <span className="text-slate-400"> · expires {when(r.expiresAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(r.id)}
                  disabled={pending}
                  className="text-xs font-medium text-[var(--color-error)] hover:underline disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
