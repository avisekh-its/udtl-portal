"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LOAD_STATUSES, LOAD_STATUS_LABELS } from "@/lib/loads";
import { filtersToQuery } from "@/lib/reports/filters";
import type { ReportFilters } from "@/lib/reports/types";
import type { ReportCustomer } from "@/lib/reports/compute";

const sel =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--color-secondary)]";

export function ReportFilterBar({
  customers,
  filters,
}: {
  customers: ReportCustomer[];
  filters: ReportFilters;
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState(filters.customerId ?? "all");
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [status, setStatus] = useState<string>(filters.status);
  const [stopType, setStopType] = useState<string>(filters.stopType);

  function apply() {
    const q = filtersToQuery({
      customerId: customer === "all" ? null : customer,
      from,
      to,
      status: status as ReportFilters["status"],
      stopType: stopType as ReportFilters["stopType"],
    });
    router.push(`/ops/reports?${q}`);
  }

  // Export links reflect the APPLIED filters (the URL), not unsaved edits.
  const exportQuery = filtersToQuery(filters);

  return (
    <div className="card flex flex-wrap items-end gap-3 p-4">
      <Field label="Customer">
        <select value={customer} onChange={(e) => setCustomer(e.target.value)} className={sel}>
          <option value="all">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field label="From">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} />
      </Field>
      <Field label="To">
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} />
      </Field>
      <Field label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="all">All statuses</option>
          {LOAD_STATUSES.map((s) => (
            <option key={s} value={s}>{LOAD_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </Field>
      <Field label="Stop type">
        <select value={stopType} onChange={(e) => setStopType(e.target.value)} className={sel}>
          <option value="all">All stops</option>
          <option value="pickup">Pickups</option>
          <option value="delivery">Deliveries</option>
        </select>
      </Field>

      <button
        type="button"
        onClick={apply}
        className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)]"
      >
        Apply
      </button>

      <div className="ml-auto flex items-end gap-2">
        <a
          href={`/api/reports/export?format=csv&${exportQuery}`}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Export CSV
        </a>
        <a
          href={`/api/reports/export?format=pdf&${exportQuery}`}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Export PDF
        </a>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {label}
      {children}
    </label>
  );
}
