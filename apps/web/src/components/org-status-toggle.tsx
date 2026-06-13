"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setOrgActiveAction } from "@/app/ops/customers/actions";

/** Activate / deactivate a customer organization. */
export function OrgStatusToggle({ orgId, active }: { orgId: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setOrgActiveAction(orgId, !active);
      if (result.error) toast.error(result.error);
      else {
        toast.success(active ? "Customer deactivated." : "Customer reactivated.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
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
