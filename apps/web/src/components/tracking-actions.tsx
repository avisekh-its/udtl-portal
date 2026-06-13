"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { syncDevicesAction, pollNowAction } from "@/app/ops/devices/actions";

export function TrackingActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.message ?? "Done.");
        router.refresh();
      }
    });
  }

  const btn =
    "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(syncDevicesAction)}
        className={`${btn} border border-[var(--color-border)] bg-white text-slate-600 hover:bg-slate-50`}
      >
        {pending ? "Working…" : "Sync devices"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(pollNowAction)}
        className={`${btn} bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary-700)]`}
      >
        {pending ? "Working…" : "Poll now"}
      </button>
    </div>
  );
}
