"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  previewCsvAction,
  commitCsvImportAction,
  type CsvPreviewResult,
  type CommitResult,
} from "@/app/ops/loads/import/actions";
import { IconDownload, IconCheckCircle, IconAlertTriangle } from "@/components/icons";
import type { AmOption } from "@/components/load-form";

const money = (cents: number, cur: string) =>
  `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2 })} ${cur}`;

export function CsvImport({ accountManagers }: { accountManagers: AmOption[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [amId, setAmId] = useState("");
  const [pending, startTransition] = useTransition();

  const validOrders = preview?.orders?.filter((o) => o.load) ?? [];

  function runPreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setPreview(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV file (use the ITS template).");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const r = await previewCsvAction(fd);
      if (r.error) setError(r.error);
      else setPreview(r);
    });
  }

  function doCommit() {
    setConfirmMissing(false);
    startTransition(async () => {
      const r = await commitCsvImportAction(
        validOrders.map((o) => ({ customerOrderNo: o.customerOrderNo, load: o.load! })),
        amId,
      );
      setResult(r);
      setPreview(null);
      router.refresh();
    });
  }

  function onCommitClick() {
    if (!amId) {
      setError("Choose an account manager for this import.");
      return;
    }
    if (validOrders.some((o) => o.missingContact.length > 0)) setConfirmMissing(true);
    else doCommit();
  }

  // ---- Result screen ----
  if (result && !result.error) {
    const failed = result.failed ?? [];
    return (
      <div className="card max-w-2xl space-y-3 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-success)]">
          <IconCheckCircle className="h-4 w-4" /> Import complete
        </div>
        <p className="text-sm text-slate-700">
          Created <strong>{result.created ?? 0}</strong>, updated <strong>{result.updated ?? 0}</strong>
          {failed.length > 0 && (
            <>
              , <span className="text-[var(--color-error)]">{failed.length} failed</span>
            </>
          )}
          .
        </p>
        {failed.length > 0 && (
          <ul className="space-y-1 text-xs text-[var(--color-error)]">
            {failed.map((f, i) => (
              <li key={i}>
                {f.order}: {f.reason}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-3 pt-1">
          <Link href="/ops/loads" className="text-sm font-medium text-[var(--color-secondary)] hover:underline">
            View loads →
          </Link>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setFileName("");
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-sm font-medium text-slate-500 hover:underline"
          >
            Import another file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Upload card */}
      <form onSubmit={runPreview} className="card max-w-2xl space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Bulk upload (ITS CSV template)</h2>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              One row per consignee. Rows that share a <strong>Customer Order #</strong> become one multi-stop order.
              Re-importing the same Customer Order # updates that order instead of duplicating.
            </p>
          </div>
          <a
            href="/ops/loads/import/template"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <IconDownload className="h-4 w-4" /> Download template
          </a>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[var(--color-primary)]/90"
        />
        {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--color-secondary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Checking…" : "Preview import"}
        </button>
      </form>

      {/* Preview */}
      {preview?.orders && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[#f7f8fa] px-5 py-3">
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{preview.summary?.validOrders ?? 0}</span> ready
              {(preview.summary?.willUpdate ?? 0) > 0 && (
                <span className="text-slate-500"> ({preview.summary?.willUpdate} update existing)</span>
              )}
              {(preview.summary?.invalidOrders ?? 0) > 0 && (
                <span className="text-[var(--color-error)]"> · {preview.summary?.invalidOrders} with errors</span>
              )}
              <span className="text-slate-400"> · {preview.summary?.totalRows} rows</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={amId}
                onChange={(e) => setAmId(e.target.value)}
                aria-label="Account manager for this import"
                className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-[var(--color-secondary)]"
              >
                <option value="" disabled>
                  Account manager…
                </option>
                {accountManagers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onCommitClick}
                disabled={pending || validOrders.length === 0 || !amId}
                className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Importing…" : `Import ${validOrders.length} order${validOrders.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          <div className="divide-y divide-[var(--color-border)]">
            {preview.orders.map((o) => (
              <div key={o.customerOrderNo} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-800">{o.customerOrderNo}</span>
                    {o.load ? (
                      o.willUpdate ? (
                        <Badge tone="info">Update</Badge>
                      ) : (
                        <Badge tone="success">New</Badge>
                      )
                    ) : (
                      <Badge tone="error">Error</Badge>
                    )}
                    {o.load && o.missingContact.length > 0 && (
                      <Badge tone="warning">Missing contact: {o.missingContact.join(", ")}</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {o.customerName || "—"} · {o.consigneeCount} consignee{o.consigneeCount === 1 ? "" : "s"} · rows{" "}
                    {o.rowNumbers.join(", ")}
                  </div>
                  {o.errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {o.errors.map((e, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-[var(--color-error)]">
                          <IconAlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {e}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="shrink-0 text-right text-sm font-medium text-slate-700">
                  {o.totalAmount ? money(o.totalAmount, o.currency) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing-contact confirm (confirm-or-cancel, per Epic 3 rule) */}
      {confirmMissing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Some stops have no contact</h3>
            <p className="mt-2 text-sm text-slate-600">
              {validOrders.filter((o) => o.missingContact.length > 0).length} order(s) have a shipper or consignee
              without a contact person or phone. Import them anyway?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmMissing(false)}
                className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doCommit}
                disabled={pending}
                className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-secondary-700)] disabled:opacity-60"
              >
                {pending ? "Importing…" : "Import anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "info" | "warning" | "error"; children: React.ReactNode }) {
  const map: Record<string, string> = {
    success: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
    info: "bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]",
    warning: "bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
    error: "bg-[var(--color-error)]/10 text-[var(--color-error)]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}
