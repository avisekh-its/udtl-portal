"use client";

import { useRef, useState } from "react";
import { IconCheckCircle } from "@/components/icons";

/** Reusable drag-and-drop file picker for the order imports (PDF + CSV). */
export function FileDropzone({
  accept,
  hint,
  file,
  onFile,
  disabled,
}: {
  accept: string; // input `accept` attribute, e.g. "application/pdf,.pdf"
  hint: string; // e.g. "Accepted file types: .pdf"
  file: File | null;
  onFile: (f: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
        drag
          ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]/5"
          : "border-[var(--color-border)] bg-slate-50/60"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />

      {file ? (
        <>
          <IconCheckCircle className="h-10 w-10 text-[var(--color-success)]" />
          <p className="mt-3 text-sm font-medium text-slate-800">{file.name}</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="mt-2 text-xs font-medium text-[var(--color-secondary)] hover:underline disabled:opacity-60"
          >
            Choose a different file
          </button>
        </>
      ) : (
        <>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400" aria-hidden>
            <path d="M12 13v8" />
            <path d="m8 17 4-4 4 4" />
            <path d="M20 16.5A4.5 4.5 0 0 0 17.5 8h-1.26A7 7 0 1 0 4 14.9" />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-600">Drag and drop file here</p>
          <p className="my-1.5 text-xs text-slate-400">or</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Choose file
          </button>
          <p className="mt-3 text-xs text-slate-400">{hint}</p>
        </>
      )}
    </div>
  );
}
