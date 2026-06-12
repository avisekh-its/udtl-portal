"use client";

import { useState, useTransition } from "react";
import { requestResetAction } from "./actions";

export function ForgotForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await requestResetAction(formData);
      if (result.error) setError(result.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 px-4 py-3 text-sm text-[var(--color-success)]">
        If an account exists for that email, a reset link is on its way. Check your inbox.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-sm text-[var(--color-error)]"
        >
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          placeholder="you@company.com"
          className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20 disabled:opacity-60"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--color-secondary)] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
