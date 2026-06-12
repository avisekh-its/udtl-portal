/**
 * A sectioned form card (e.g. "Company", "Address", "Tracking").
 * Renders a titled card with a responsive field grid (two columns on desktop).
 * Pure/presentational.
 */
export function FormSection({
  title,
  description,
  columns = 2,
  children,
}: {
  title: string;
  description?: string;
  columns?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <div className={`grid gap-x-5 gap-y-4 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {children}
      </div>
    </section>
  );
}

/**
 * A labelled field wrapper: label, optional hint, the control (children), and an
 * optional inline error shown UNDER the field. Set `full` to span both columns.
 */
export function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  required,
  full,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-[var(--color-error)]"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="text-[11px] font-medium text-[var(--color-error)]">{error}</p>}
    </div>
  );
}

/** Shared input class so all form controls look identical. */
export const controlClass =
  "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/15 disabled:opacity-60";
