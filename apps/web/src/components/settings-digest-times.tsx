"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setDigestTimesAction } from "@/app/ops/settings/actions";

/** Configure the two daily digest send times (America/Winnipeg). */
export function SettingsDigestTimes({ initial }: { initial: string[] }) {
  const [t1, setT1] = useState(initial[0] ?? "08:00");
  const [t2, setT2] = useState(initial[1] ?? "16:00");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await setDigestTimesAction([t1, t2].filter(Boolean));
      if (res.error) toast.error(res.error);
      else toast.success("Digest times saved.");
    });
  }

  const input =
    "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20";

  return (
    <div className="card p-5">
      <div className="text-sm font-medium text-slate-800">Digest send times</div>
      <p className="mt-0.5 text-xs text-slate-500">
        Customers receive a summary of their active orders at these times (America/Winnipeg).
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Morning
          <input type="time" value={t1} onChange={(e) => setT1(e.target.value)} disabled={pending} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Afternoon
          <input type="time" value={t2} onChange={(e) => setT2(e.target.value)} disabled={pending} className={input} />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
