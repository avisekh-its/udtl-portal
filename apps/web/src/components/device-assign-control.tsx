"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { controlClass } from "@/components/form/form-section";
import { assignDeviceAction } from "@/app/ops/loads/actions";
import type { DeviceOption } from "@/app/ops/loads/assignment-data";
import { IconDevice, IconAlertTriangle } from "@/components/icons";

export interface CurrentDevice {
  id: number;
  name: string;
  hasGateway: boolean;
}

export function DeviceAssignControl({
  loadId,
  current,
  options,
}: {
  loadId: number;
  current: CurrentDevice | null;
  options: DeviceOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(current ? String(current.id) : "");
  const [confirm, setConfirm] = useState<null | { deviceId: number | null; label: string }>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = useMemo(
    () => options.find((o) => String(o.id) === selected) ?? null,
    [options, selected],
  );
  const changed = (current ? String(current.id) : "") !== selected;

  function apply(deviceId: number | null) {
    setConfirm(null);
    setMsg(null);
    startTransition(async () => {
      const res = await assignDeviceAction(loadId, deviceId);
      if (res.error) setMsg({ ok: false, text: res.error });
      else {
        setMsg({ ok: true, text: res.message ?? "Saved." });
        router.refresh();
      }
    });
  }

  function requestAssign() {
    if (!chosen) return;
    let warn = "";
    if (!chosen.hasGateway) warn = " This device has no GPS gateway, so the load won't show a live position.";
    else if (chosen.assignedTo) warn = ` It's currently tracking ${chosen.assignedTo.ref} — assigning here moves it.`;
    setConfirm({ deviceId: chosen.id, label: `Track this load with ${chosen.name}?${warn}` });
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <IconDevice className="h-[18px] w-[18px] text-[var(--color-secondary)]" />
        <h2 className="text-sm font-semibold text-slate-800">Tracking device</h2>
      </div>

      {current ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Assigned:</span>
          <span className="font-medium text-slate-800">{current.name}</span>
          {!current.hasGateway && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
              <IconAlertTriangle className="h-3.5 w-3.5" /> No GPS gateway
            </span>
          )}
        </div>
      ) : (
        <p className="mb-3 text-sm text-slate-500">No device assigned — this load isn’t trackable yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className={`${controlClass} w-auto min-w-[16rem] flex-1`}
        >
          <option value="">Select a device…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.plate ? ` · ${o.plate}` : ` · ${o.asset}`}
              {!o.hasGateway ? " — no GPS gateway" : o.assignedTo ? ` — in use on ${o.assignedTo.ref}` : ""}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={requestAssign}
          disabled={!chosen || !changed || pending}
          className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : current ? "Change" : "Assign"}
        </button>

        {current && (
          <button
            type="button"
            onClick={() => setConfirm({ deviceId: null, label: `Stop tracking this load and clear ${current.name}?` })}
            disabled={pending}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      {/* Live flag for the chosen-but-not-yet-saved option */}
      {chosen && changed && !chosen.hasGateway && (
        <p className="mt-2 text-xs text-[var(--color-warning)]">
          {chosen.name} has no GPS gateway — live position won’t be available.
        </p>
      )}
      {chosen && changed && chosen.hasGateway && chosen.assignedTo && (
        <p className="mt-2 text-xs text-[var(--color-warning)]">
          {chosen.name} is currently tracking {chosen.assignedTo.ref}. Assigning here will move it.
        </p>
      )}

      {msg && (
        <p className={`mt-3 text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
          {msg.text}
        </p>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {confirm.deviceId === null ? "Clear tracking device" : "Confirm device"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">{confirm.label}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => apply(confirm.deviceId)}
                disabled={pending}
                className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-secondary-700)] disabled:opacity-60"
              >
                {pending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
