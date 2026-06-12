import Link from "next/link";

/**
 * Inline action footer for forms: a divider with the primary submit + secondary
 * actions aligned right. (Not sticky — keeps long forms clean instead of a
 * floating bar.)
 */
export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-5">
      {children}
    </div>
  );
}

export function CancelLink({ href, children = "Cancel" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

export function PrimaryButton({
  children,
  disabled,
  type = "submit",
  onClick,
  variant = "solid",
  name,
  value,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  variant?: "solid" | "outline";
  name?: string;
  value?: string;
}) {
  const cls =
    variant === "outline"
      ? "border border-[var(--color-secondary)] bg-white text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/5"
      : "bg-[var(--color-secondary)] text-white shadow-sm hover:bg-[var(--color-secondary-700)]";
  return (
    <button
      type={type}
      name={name}
      value={value}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${cls}`}
    >
      {children}
    </button>
  );
}
