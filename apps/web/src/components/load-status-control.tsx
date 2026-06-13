"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  LOAD_STATUSES,
  LOAD_STATUS_LABELS,
  isBackwardTransition,
  type LoadStatus,
} from "@/lib/loads";
import { updateLoadStatusAction } from "@/app/ops/loads/actions";
import { StatusChip } from "@/components/status-chip";
import { LOAD_STATUS_MAP } from "@/components/status-badge";
import { controlClass } from "@/components/form/form-section";

export function LoadStatusControl({ loadId, current }: { loadId: number; current: LoadStatus }) {
  const router = useRouter();
  const [target, setTarget] = useState<LoadStatus>(current);
  const [pending, startTransition] = useTransition();

  const backward = isBackwardTransition(current, target);
  const changed = target !== current;
  const chip = LOAD_STATUS_MAP[current];

  function apply() {
    startTransition(async () => {
      const res = await updateLoadStatusAction(loadId, target);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Status updated to ${LOAD_STATUS_LABELS[target]}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Status</span>
          {chip && <StatusChip label={chip.label} tone={chip.tone} />}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as LoadStatus)}
            className={`${controlClass} w-auto`}
          >
            {LOAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LOAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={apply}
            disabled={!changed || pending}
            className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Updating…" : "Update"}
          </button>
        </div>
      </div>
      {changed && backward && (
        <p className="mt-3 text-xs text-[var(--color-warning)]">
          This is a backward change from <strong>{LOAD_STATUS_LABELS[current]}</strong> to{" "}
          <strong>{LOAD_STATUS_LABELS[target]}</strong>. It will be recorded in the audit log as an exception.
        </p>
      )}
    </div>
  );
}
