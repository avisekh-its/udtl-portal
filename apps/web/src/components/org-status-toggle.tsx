"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setOrgActiveAction } from "@/app/ops/customers/actions";

/** Activate / deactivate a customer organization. */
export function OrgStatusToggle({ orgId, active }: { orgId: string; active: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setOrgActiveAction(orgId, !active);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-[var(--color-error)]">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "…" : active ? "Deactivate customer" : "Reactivate customer"}
      </button>
    </div>
  );
}
