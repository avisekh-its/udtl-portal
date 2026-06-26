"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { sendDelayedAlertAction } from "@/app/ops/loads/actions";

/** Staff-only "send a Delayed alert" — notifies subscribers, no status change. */
export function DelayedAlertButton({ loadId }: { loadId: number }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const res = await sendDelayedAlertAction(loadId);
      setConfirming(false);
      if (res.error) toast.error(res.error);
      else toast.success("Delayed alert sent to subscribers.");
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Notify subscribers this load is delayed?</span>
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="rounded-lg bg-[#d97706] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#b45309] disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send alert"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#d97706]/40 bg-[#d97706]/5 px-3 py-1.5 text-xs font-semibold text-[#b45309] transition hover:bg-[#d97706]/10"
    >
      Send delayed alert
    </button>
  );
}
