"use client";

import { useState, useTransition } from "react";
import { parsePdfOrderAction, type PdfParseResult } from "@/app/ops/loads/import/actions";
import { LoadForm, type OrgOption, type AmOption } from "@/components/load-form";
import { FileDropzone } from "@/components/import/file-dropzone";
import { IconAlertTriangle, IconCheckCircle } from "@/components/icons";

export function PdfImport({ orgs, accountManagers }: { orgs: OrgOption[]; accountManagers: AmOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PdfParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileName = file?.name ?? "";

  function extract(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a UDTL order-sheet PDF first.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const r = await parsePdfOrderAction(fd);
      if (r.error) setError(r.error);
      else setResult(r);
    });
  }

  if (result?.load) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-success)]">
            <IconCheckCircle className="h-4 w-4" /> Extracted from {fileName || "the PDF"} — review &amp; edit, then create.
          </div>
          {result.billToName && (
            <p className="mt-2 text-xs text-slate-600">
              Bill-To on the sheet: <span className="font-medium">{result.billToName}</span>
              {result.suggestedOrgId
                ? " — matched to a customer below."
                : " — no customer matched; pick the customer below."}
            </p>
          )}
          {result.warnings && result.warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-warning)]">
                  <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
        </div>

        <LoadForm mode="create" orgs={orgs} accountManagers={accountManagers} initial={result.load} />

        <button
          type="button"
          onClick={() => {
            setResult(null);
            setFile(null);
          }}
          className="text-sm font-medium text-slate-500 hover:underline"
        >
          ← Import a different PDF
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={extract} className="card max-w-xl space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Upload a UDTL order-sheet PDF</h2>
        <p className="mt-1 text-xs text-slate-500">
          Single order only — one shipper and one or more consignees. We&apos;ll pre-fill a review screen you can
          correct before creating the order.
        </p>
      </div>

      <FileDropzone
        accept="application/pdf,.pdf"
        hint="Accepted file types: .pdf"
        file={file}
        onFile={(f) => {
          setFile(f);
          setError(null);
        }}
        disabled={pending}
      />

      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--color-secondary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Extracting…" : "Extract order"}
      </button>
    </form>
  );
}
