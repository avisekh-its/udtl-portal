"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setReportScheduleAction } from "@/app/ops/settings/actions";
import type { ReportSchedule } from "@/lib/settings";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const input =
  "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20";

/** Configure the weekly performance-report email (Epic 12). */
export function SettingsReportSchedule({ initial }: { initial: ReportSchedule }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [day, setDay] = useState(initial.day);
  const [time, setTime] = useState(initial.time);
  const [recipients, setRecipients] = useState(initial.recipients.join("\n"));
  const [pending, startTransition] = useTransition();

  function save() {
    const list = recipients
      .split(/[\n,]/)
      .map((r) => r.trim())
      .filter(Boolean);
    startTransition(async () => {
      const res = await setReportScheduleAction({ enabled, day, time, recipients: list });
      if (res.error) toast.error(res.error);
      else toast.success("Weekly report saved.");
    });
  }

  return (
    <div className="card p-5">
      <div className="text-sm font-medium text-slate-800">Weekly performance report</div>
      <p className="mt-0.5 text-xs text-slate-500">
        Email a last-7-days performance summary (CSV + PDF attached) to the recipients below, on the chosen day/time
        (America/Winnipeg).
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={pending} />
        Send the weekly report
      </label>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Day
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} disabled={pending} className={input}>
            {DAYS.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={pending} className={input} />
        </label>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
        Recipients (one per line, or comma-separated)
        <textarea
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          disabled={pending}
          rows={3}
          placeholder="ops@itsinc.ca&#10;manager@itsinc.ca"
          className={`${input} font-mono`}
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-3 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
