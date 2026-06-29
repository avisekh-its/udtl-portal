"use client";

import { useState, useTransition } from "react";
import { StarInput, StarRating } from "@/components/star-rating";
import { submitRatingAction } from "./actions";

export function RateForm({ token }: { token: string }) {
  const [score, setScore] = useState(0);
  const [review, setReview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (score < 1) {
      setError("Please pick a star rating.");
      return;
    }
    startTransition(async () => {
      const res = await submitRatingAction(token, score, review);
      if (res.error) setError(res.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <div className="mt-5 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 p-4 text-center">
        <div className="flex justify-center"><StarRating value={score} size={22} /></div>
        <p className="mt-2 text-sm font-medium text-slate-800">Thank you for your feedback!</p>
        <p className="mt-1 text-xs text-slate-500">Your rating has been sent to United Dhillon Trucking Lines.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col items-center gap-2">
        <StarInput value={score} onChange={setScore} />
        <span className="text-xs text-slate-400">{score ? `${score} / 5` : "Tap to rate"}</span>
      </div>

      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Tell us about your experience (optional)…"
        className="block w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[var(--color-secondary)]"
      />

      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-lg bg-[var(--color-secondary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit rating"}
      </button>
    </div>
  );
}
