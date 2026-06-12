"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setUserActiveAction } from "@/app/ops/users/actions";

/** Activate / deactivate button for a user row. Hidden for the current user. */
export function UserActiveToggle({ userId, active }: { userId: string; active: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setUserActiveAction(userId, !active);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-[var(--color-error)]">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
          active
            ? "border border-[var(--color-border)] text-slate-600 hover:bg-slate-50"
            : "bg-[var(--color-success)]/12 text-[#247d49] hover:bg-[var(--color-success)]/20"
        }`}
      >
        {pending ? "…" : active ? "Deactivate" : "Reactivate"}
      </button>
    </div>
  );
}
