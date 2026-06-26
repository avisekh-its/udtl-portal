"use client";

import { useState, useTransition } from "react";
import { unsubscribeAction } from "./actions";

export function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState<{ contact?: string; channel?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go() {
    setError(null);
    startTransition(async () => {
      const res = await unsubscribeAction(token);
      if (res.error) setError(res.error);
      else setDone({ contact: res.contact, channel: res.channel });
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 p-4 text-sm text-[var(--color-success)]">
        You&apos;ve been unsubscribed. {done.contact} will no longer receive{" "}
        {done.channel === "sms" ? "SMS" : "email"} order updates from UDTL.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">
        Stop receiving order-update emails from United Dhillon Trucking Lines? You can re-subscribe
        anytime from any order&apos;s notification settings.
      </p>
      <button
        type="button"
        onClick={go}
        disabled={pending || !token}
        className="rounded-lg bg-[var(--color-secondary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Unsubscribing…" : "Unsubscribe"}
      </button>
    </div>
  );
}
