"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setCostVisibilityAction } from "@/app/ops/settings/actions";

export function SettingsCostToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await setCostVisibilityAction(next);
      if (res.error) {
        setOn(!next); // revert
        toast.error(res.error);
      } else {
        toast.success(next ? "Cost is now visible to customers." : "Cost is now hidden from customers.");
        router.refresh();
      }
    });
  }

  return (
    <div className="card flex items-center justify-between p-5">
      <div>
        <div className="text-sm font-medium text-slate-800">Show per-load cost to customers</div>
        <p className="mt-0.5 text-xs text-slate-500">
          When on, customers can see the cost on their orders. Default is on.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        disabled={pending}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
          on ? "bg-[var(--color-success)]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
